'use server';

import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';

import { buildInspectionRecord } from './db-payload';
import { fullSchema, type FormValues } from './schema';

export interface SubmitInspectionResult {
	error: string;
}

/**
 * Persists a completed inspection for one hive.
 *
 * Bound to its `hiveId` by the page and handed the form's values by the client.
 * Every guard the `/inspect/[hiveId]` page runs is re-run here — the page is a
 * render-time check and this is reachable on its own with any `$ACTION_ID`.
 *
 * On success it redirects and never returns; a returned `{ error }` means the
 * form should stay put and show the message. PDF generation is out of scope —
 * that path still lives in `InspectionForm`'s `downloadPdf`.
 */
export async function submitInspectionAction(hiveId: string, values: FormValues): Promise<SubmitInspectionResult> {
	const session = await auth();
	if (!session?.user?.id) {
		return { error: 'Twoja sesja wygasła. Zaloguj się ponownie.' };
	}
	const userId = session.user.id;

	// Ownership: the hive must sit in this user's apiary. The nested filter is the
	// whole check — a bare id proves nothing, and a miss is indistinguishable
	// from "no such hive" so nothing leaks.
	const hive = await prisma.hive.findFirst({
		where: { id: hiveId, apiary: { userId } },
		select: { id: true },
	});
	if (!hive) {
		return { error: 'Nie masz dostępu do tego ula.' };
	}

	// The client validates step by step, but a draft can be submitted with whole
	// sections unanswered — parse the lot server-side before writing.
	const parsed = fullSchema.safeParse(values);
	if (!parsed.success) {
		return { error: 'Formularz zawiera braki lub błędy. Wróć i popraw zaznaczone sekcje.' };
	}

	const record = buildInspectionRecord(parsed.data);

	try {
		await prisma.$transaction(async (tx) => {
			const created = await tx.inspection.create({
				data: { hiveId, userId, inspectedAt: new Date(), ...record },
			});

			// Denormalised pointer the dashboard reads. Same transaction so a hive
			// never points at an inspection that rolled back.
			await tx.hive.update({
				where: { id: hiveId },
				data: { currentInspectionId: created.id },
			});
		});
	} catch (error) {
		console.error('Inspection submit failed:', error);
		return { error: 'Nie udało się zapisać przeglądu. Spróbuj ponownie.' };
	}

	// Outside the try: redirect() throws NEXT_REDIRECT, which must propagate.
	redirect(`/dashboard?inspected=${hiveId}`);
}
