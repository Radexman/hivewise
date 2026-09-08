import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';

import { HiveInspection } from '@/app/components/inspection/HiveInspection';

export const metadata: Metadata = {
	title: 'Przegląd ula · Hivewise',
};

/**
 * The inspection form for one hive, reached from the "Przegląd" button on a
 * dashboard hive card.
 *
 * Deliberately outside the `(dashboard)` group — like `/inspection`, the form's
 * voice panel claims 46dvh at the bottom of the viewport and that group's shell
 * puts a fixed tab bar in the same space on phones.
 *
 * `proxy.ts` turns anonymous requests away first, but that check only reads the
 * session cookie. This is the real gate: it re-checks the session and, crucially,
 * that the hive belongs to the caller's apiary.
 */
export default async function InspectHivePage({ params }: { params: Promise<{ hiveId: string }> }) {
	const { hiveId } = await params;

	const session = await auth();
	if (!session?.user?.id) {
		redirect('/sign-in');
	}

	// Ownership is the filter — a hive id is not authorisation. An unknown id and
	// another user's hive both fall through to the same 404, so neither the
	// existence nor the owner of a hive leaks.
	const hive = await prisma.hive.findFirst({
		where: { id: hiveId, apiary: { userId: session.user.id } },
		select: {
			id: true,
			label: true,
			currentInspection: {
				select: { queen: true, brood: true, colony: true, comb: true, health: true, actions: true },
			},
			_count: { select: { inspections: true } },
		},
	});

	if (!hive) {
		notFound();
	}

	return (
		<div className='mx-auto w-full max-w-6xl px-4 py-10'>
			<HiveInspection
				hiveId={hive.id}
				hiveLabel={hive.label}
				prefill={hive.currentInspection}
				nextInspectionNumber={hive._count.inspections + 1}
			/>
		</div>
	);
}
