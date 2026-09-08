import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { pdfLimiter } from '@/app/lib/ratelimit';
import { checkRateLimit, formatRetryAfter, rateLimitedResponse } from '@/app/lib/ratelimit-helpers';
import { buildPdfPayload } from '@/app/lib/pdf-payload';

// The same external service the mid-wizard `/api/generate-pdf` proxy calls.
// `PDF_SERVICE_URL` already points at the full `/generate-pdf` endpoint — see
// `.env.example` — so it is used verbatim, not suffixed.
const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL;

// Monthly PDF allowance per tier, checked against
// `UsagePeriod.pdfGenerationsUsed` for the current calendar month.
const PDF_LIMIT_FREE = 20;
const PDF_LIMIT_PREMIUM = 100;

// Render's free tier spins down after inactivity; the first request back can
// take 30–60s to cold-start. Give it the full minute before cutting it loose
// with a friendly error — a 30s ceiling reliably fails the first click.
const PDF_SERVICE_TIMEOUT_MS = 60_000;

/** First day of the current month at midnight UTC — the `UsagePeriod` key. */
function currentPeriodStart(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Generates a PDF of one persisted inspection on demand and streams it back as
 * a file download. Nothing is stored — generation is stateless.
 *
 * Guard order matters: auth → Redis rate limit → ownership → monthly quota.
 * The rate limit runs before any DB call and before the quota check, so a
 * flood of concurrent requests is refused up front rather than racing the
 * usage counter past its limit.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
	const { inspectionId } = await params;

	// ── auth ────────────────────────────────────────────────────────────────
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: 'Musisz być zalogowany, aby wygenerować PDF.' }, { status: 401 });
	}
	const userId = session.user.id;

	// ── rate limit (Redis — fast, before any DB call) ───────────────────────
	const { limited, retryAfterSeconds } = await checkRateLimit(pdfLimiter, userId);
	if (limited) {
		return rateLimitedResponse(
			`Przekroczono limit generowania PDF. Spróbuj ponownie za ${formatRetryAfter(retryAfterSeconds)}.`,
			retryAfterSeconds,
		);
	}

	if (!PDF_SERVICE_URL) {
		console.error('[pdf] PDF_SERVICE_URL is not set');
		return NextResponse.json({ error: 'Serwis PDF nie jest skonfigurowany.' }, { status: 503 });
	}

	// ── ownership ───────────────────────────────────────────────────────────
	// `Inspection.userId` is the whole check — a bare id from the URL proves
	// nothing, and a miss is indistinguishable from "no such inspection".
	const inspection = await prisma.inspection.findFirst({
		where: { id: inspectionId, userId },
		include: {
			hive: { include: { apiary: { select: { name: true, location: true } } } },
		},
	});
	if (!inspection) {
		return NextResponse.json({ error: 'Przegląd nie istnieje.' }, { status: 404 });
	}

	// ── monthly quota ───────────────────────────────────────────────────────
	const periodStart = currentPeriodStart(new Date());

	const [period, subscription, inspectionNumber] = await Promise.all([
		prisma.usagePeriod.findUnique({
			where: { userId_periodStart: { userId, periodStart } },
			select: { pdfGenerationsUsed: true },
		}),
		prisma.subscription.findUnique({
			where: { userId },
			select: { tier: true },
		}),
		// Position of this inspection in the hive's history, for the report's
		// "Przegląd nr" line. `@@index([hiveId, inspectedAt])` covers it.
		prisma.inspection.count({
			where: { hiveId: inspection.hiveId, inspectedAt: { lte: inspection.inspectedAt } },
		}),
	]);

	const isPremium = subscription?.tier === 'PREMIUM';
	const pdfLimit = isPremium ? PDF_LIMIT_PREMIUM : PDF_LIMIT_FREE;
	const used = period?.pdfGenerationsUsed ?? 0;

	if (used >= pdfLimit) {
		return NextResponse.json(
			{
				error: isPremium
					? `Osiągnięto miesięczny limit ${PDF_LIMIT_PREMIUM} plików PDF.`
					: `Osiągnięto miesięczny limit ${PDF_LIMIT_FREE} plików PDF. Przejdź na Premium, aby generować więcej.`,
				upgradeRequired: !isPremium,
			},
			{ status: 429 },
		);
	}

	// ── call the microservice ───────────────────────────────────────────────
	const payload = buildPdfPayload(inspection, {
		beekeeperName: session.user.name,
		inspectionNumber,
	});

	let upstream: Response;
	try {
		upstream = await fetch(PDF_SERVICE_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(PDF_SERVICE_TIMEOUT_MS),
		});
	} catch (error) {
		console.error('[pdf] microservice fetch failed:', error);
		return NextResponse.json(
			{ error: 'Serwis PDF jest chwilowo niedostępny. Spróbuj ponownie za chwilę.' },
			{ status: 503 },
		);
	}

	if (!upstream.ok) {
		console.error('[pdf] microservice error:', upstream.status);
		return NextResponse.json({ error: 'Nie udało się wygenerować PDF.' }, { status: 502 });
	}

	// ── increment usage — only now, so a failed generation never counts ─────
	await prisma.usagePeriod.upsert({
		where: { userId_periodStart: { userId, periodStart } },
		create: { userId, periodStart, pdfGenerationsUsed: 1 },
		update: { pdfGenerationsUsed: { increment: 1 } },
	});

	// ── stream the PDF back ─────────────────────────────────────────────────
	// `attachment` forces a download and never an inline render, so a
	// compromised microservice cannot ship active content into our origin.
	const filename = `hivewise-inspekcja-${inspectionId.slice(0, 8)}.pdf`;

	return new NextResponse(upstream.body, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store',
		},
	});
}
