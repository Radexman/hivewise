import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/auth';
import { ChevronLeftIcon } from '@/app/components/dashboard/icons';
import { StrengthDots } from '@/app/components/dashboard/StrengthDots';
import { TopbarShell } from '@/app/components/dashboard/Topbar';
import { HistoryList } from '@/app/components/hive/HistoryList';
import { HoneyChart } from '@/app/components/hive/HoneyChart';
import { PrintButton } from '@/app/components/hive/PrintButton';
import { StatCard } from '@/app/components/hive/StatCard';
import { StatusPill } from '@/app/components/hive/StatusPill';
import { deriveHiveStatus, deriveStrength, formatInspectionDate } from '@/app/lib/dashboard';
import {
	deriveBroodSummary,
	deriveHoneyLabel,
	deriveQueenStat,
	freeHistoryCutoff,
	HIVE_TYPE_LABEL,
} from '@/app/lib/hive-detail';
import { prisma } from '@/app/lib/prisma';
import type { BroodData, QueenData } from '@/types/inspection';

export const metadata: Metadata = {
	title: 'Szczegóły ula · Hivewise',
};

const SECTION_LABEL = 'mb-2.5 text-[11px] font-semibold tracking-[0.09em] text-muted uppercase';

/**
 * The hive detail page, reached from the "Szczegóły" button on a dashboard hive
 * card. Renders the current state from the last inspection, a honey trend
 * chart, the full inspection history, and a print button.
 *
 * `proxy.ts` turns anonymous requests away first, and the `(dashboard)` layout
 * gates rendering — but this still re-checks the session and, crucially, that
 * the hive belongs to the caller's apiary. An unknown id and another user's
 * hive both fall through to the same 404.
 */
export default async function HiveDetailPage({ params }: { params: Promise<{ hiveId: string }> }) {
	const { hiveId } = await params;

	const session = await auth();
	if (!session?.user?.id) {
		redirect('/sign-in');
	}

	// Captured once so the status derivation and the free-history window agree
	// about "now" across a midnight boundary.
	const now = new Date();

	const subscription = await prisma.subscription.findUnique({
		where: { userId: session.user.id },
		select: { tier: true },
	});

	// No subscription row at all reads as FREE — an account created through
	// `/api/auth/register` has none.
	const isPremium = subscription?.tier === 'PREMIUM';
	const cutoff = isPremium ? null : freeHistoryCutoff(now);

	const hive = await prisma.hive.findFirst({
		where: { id: hiveId, apiary: { userId: session.user.id } },
		include: {
			apiary: { select: { name: true, location: true } },
			// Full record: the stat cards read its `queen` / `brood` / `colony`
			// JSON and its `honeyKg` scalar.
			currentInspection: true,
			inspections: {
				orderBy: { inspectedAt: 'asc' },
				// Free accounts see only the last 3 months, in both the chart and
				// the list below.
				where: cutoff ? { inspectedAt: { gte: cutoff } } : undefined,
				select: {
					id: true,
					inspectedAt: true,
					honeyKg: true,
					queen: true,
					health: true,
					notes: true,
				},
			},
		},
	});

	if (!hive) {
		notFound();
	}

	const current = hive.currentInspection;
	const uninspected = current === null;

	const queen = current ? (current.queen as QueenData) : null;
	const brood = current ? (current.brood as BroodData) : null;

	const status = deriveHiveStatus(hive, now);
	const queenStat = deriveQueenStat(queen);

	return (
		<>
			<TopbarShell
				title={
					<Link
						href='/dashboard'
						className='detail-back-link flex min-w-0 items-center gap-1.5 text-[14px] font-medium text-foreground transition-colors hover:text-accent lg:text-[13px]'
					>
						<ChevronLeftIcon className='h-4 w-4 shrink-0 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]' />
						<span className='truncate'>{hive.apiary.name}</span>
					</Link>
				}
				actions={<PrintButton />}
			/>

			<div className='flex-1 p-4 lg:p-6'>
				{/* Hidden on screen, shown only when printing — see the `@media print`
				    block in `globals.css`. */}
				<div className='print-header mb-6 text-[11px] text-muted'>
					<strong>Hivewise</strong> · {hive.apiary.name} · {hive.label} · Raport wygenerowany{' '}
					{now.toLocaleDateString('pl-PL')}
				</div>

				{/* Hero */}
				<div className='mb-6 flex items-start justify-between gap-3'>
					<div className='min-w-0'>
						<h1 className='text-[22px] font-semibold tracking-[-0.02em] text-foreground lg:text-[20px]'>
							{hive.label}
							<span className='ml-1.5 text-[15px] font-normal text-muted'>· {hive.apiary.name}</span>
						</h1>
						<p className='mt-0.5 font-mono text-[13px] text-muted lg:text-[12px]'>
							{HIVE_TYPE_LABEL[hive.hiveType]} ·{' '}
							{current ? `ostatni przegląd ${formatInspectionDate(current.inspectedAt)}` : 'brak przeglądów'}
						</p>
					</div>
					<StatusPill
						status={status}
						uninspected={uninspected}
					/>
				</div>

				{/* Stat cards */}
				<div className='mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4'>
					<StatCard
						label='Matka'
						value={queenStat.label}
						tone={queenStat.tone}
					/>
					<StatCard
						label='Siła'
						value={
							<StrengthDots
								value={deriveStrength(hive)}
								variant={status}
							/>
						}
					/>
					<StatCard
						label='Czerw'
						value={deriveBroodSummary(brood)}
					/>
					<StatCard
						label='Miód'
						value={deriveHoneyLabel(current?.honeyKg ?? null)}
						tone='amber'
					/>
				</div>

				{/* Honey trend chart */}
				<div className='mb-6'>
					<h2 className={SECTION_LABEL}>Trend miodu</h2>
					<HoneyChart
						inspections={hive.inspections.map((inspection) => ({
							inspectedAt: inspection.inspectedAt,
							honeyKg: inspection.honeyKg,
						}))}
						isPremium={isPremium}
					/>
				</div>

				{/* Inspection history */}
				<div>
					<h2 className={SECTION_LABEL}>Historia przeglądów</h2>
					<HistoryList
						inspections={hive.inspections}
						isPremium={isPremium}
					/>
				</div>
			</div>
		</>
	);
}
