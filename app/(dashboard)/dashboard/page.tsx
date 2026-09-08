import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import {
	buildHiveTypeSummary,
	buildSummaryLine,
	deriveAlertDescription,
	deriveHiveStatus,
	deriveQueenStatus,
	deriveStrength,
	firstNameOf,
	formatInspectionDate,
	getGreeting,
	latestInspectionDate,
} from '@/app/lib/dashboard';

import { AlertCard, type AlertCardProps } from '../../components/dashboard/AlertCard';
import { HiveCard, type HiveCardProps } from '../../components/dashboard/HiveCard';
import { InspectionSavedToast } from '../../components/dashboard/InspectionSavedToast';
import { Topbar } from '../../components/dashboard/Topbar';
import { HoneycombBackdrop } from '../../components/ui/HoneycombBackdrop';

const SECTION_LABEL = 'mb-2.5 text-[11px] font-semibold tracking-[0.09em] text-muted uppercase lg:text-[10px]';

/**
 * The signed-in user's apiary, rendered from Postgres.
 *
 * A server component, and necessarily a dynamic one: it reads the session and
 * derives against the current clock, so the static prerender Spec 1 shipped is
 * gone by design rather than by regression.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ inspected?: string }> }) {
	const { inspected } = await searchParams;
	const session = await auth();

	// Proxy already turned away anonymous requests before this ran; this is the
	// non-optimistic check behind it, and it is what narrows `user.id` for the
	// query below.
	if (!session?.user?.id) {
		redirect('/sign-in');
	}

	// One round trip for the whole page. `Apiary.userId` is `@unique`, which is
	// what makes `findUnique` legal here, and the nested include is what keeps
	// this from becoming a query per hive.
	const apiary = await prisma.apiary.findUnique({
		where: { userId: session.user.id },
		include: {
			hives: {
				// `label` is a tiebreaker, not decoration. The seed creates all five
				// hives in one transaction, so Postgres' `now()` stamps them with the
				// same `createdAt` and ordering by it alone is not deterministic —
				// the grid reshuffled the moment four of the rows were updated.
				// (Lexicographic, so "Ul 10" would sort before "Ul 2"; a natural sort
				// belongs here once labels reach double digits.)
				orderBy: [{ createdAt: 'asc' }, { label: 'asc' }],
				include: { currentInspection: true },
			},
		},
	});

	const firstName = firstNameOf(session.user.name ?? null);

	/*
	 * The spec redirects to `/onboarding` here. That route does not exist, and
	 * three live accounts reach this branch — both Google users and the demo
	 * account on production — so a redirect would send them to a 404. An empty
	 * state costs less than a route and leaves nothing dangling; onboarding is
	 * explicitly out of this spec's scope either way.
	 */
	if (!apiary) {
		return <NoApiary firstName={firstName} />;
	}

	// Captured once so every derivation on this render agrees about "now" — two
	// `new Date()` calls either side of midnight would disagree about overdue.
	const now = new Date();

	const hivesWithStatus = apiary.hives.map((hive) => ({
		hive,
		status: deriveHiveStatus(hive, now),
		queenStatus: deriveQueenStatus(hive),
	}));

	const hives: HiveCardProps[] = hivesWithStatus.map(({ hive, status, queenStatus }) => ({
		hiveId: hive.id,
		label: hive.label,
		queenStatus,
		strength: deriveStrength(hive),
		lastInspection: formatInspectionDate(hive.currentInspection?.inspectedAt ?? null),
		status,
	}));

	// flatMap rather than filter + map: inside the non-'ok' branch TypeScript
	// narrows `status` to `AlertVariant` on its own, so `variant` needs no cast
	// and no type predicate to prove 'ok' was excluded.
	const alerts: (AlertCardProps & { id: string })[] = hivesWithStatus.flatMap(({ hive, status }) =>
		status === 'ok'
			? []
			: [
					{
						id: hive.id,
						hiveLabel: hive.label,
						variant: status,
						description: deriveAlertDescription(hive, now),
						strength: deriveStrength(hive),
						date: formatInspectionDate(hive.currentInspection?.inspectedAt ?? null),
					},
				],
	);

	const summary = buildSummaryLine(apiary.hives.length, latestInspectionDate(apiary.hives), alerts.length);
	const hiveTypeSummary = buildHiveTypeSummary(apiary.hives.map((hive) => hive.hiveType));

	// `?inspected=` is set by the submit redirect; ignore a value that is not one
	// of this user's hives.
	const inspectedHive = inspected ? (apiary.hives.find((hive) => hive.id === inspected) ?? null) : null;

	return (
		<>
			<Topbar
				apiaryName={apiary.name}
				location={apiary.location ?? ''}
			/>

			{inspectedHive && (
				<InspectionSavedToast
					hiveId={inspectedHive.id}
					hiveLabel={inspectedHive.label}
				/>
			)}

			<div className='flex-1 p-4 lg:p-6'>
				<div className='mb-5 lg:mb-6'>
					<h1 className='mb-0.5 text-[22px] font-semibold tracking-[-0.02em] text-foreground lg:text-[20px]'>
						{getGreeting(firstName, now)}
					</h1>
					<p className='font-mono text-[13px] text-muted lg:text-[12px]'>{summary}</p>
				</div>

				{/* The whole section disappears when nothing needs attention — an empty
				    heading over an empty grid reads as a rendering fault. */}
				{alerts.length > 0 && (
					<>
						<h2 className={SECTION_LABEL}>Wymagają uwagi</h2>
						{/* One per row on phones — an alert's description is a full sentence and
						    truncating the reason a hive needs attention defeats the section. */}
						<div className='mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
							{alerts.map(({ id, ...alert }) => (
								<AlertCard
									key={id}
									{...alert}
								/>
							))}
						</div>
					</>
				)}

				<h2 className={SECTION_LABEL}>Ule</h2>
				<p className='mb-4 text-[13px] text-muted lg:text-[12px]'>{hiveTypeSummary}</p>

				{hives.length > 0 ? (
					/* Two up on phones: enough hives per screen to avoid hunting, while each
					   card stays wide enough for a full-width "Przegląd". */
					<div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-2'>
						{hives.map((hive) => (
							<HiveCard
								key={hive.hiveId}
								{...hive}
							/>
						))}
					</div>
				) : (
					<p className='rounded-[10px] border border-border bg-surface p-4 text-[13px] text-muted'>
						Ta pasieka nie ma jeszcze uli. Dodaj pierwszy ul, aby zacząć prowadzić przeglądy.
					</p>
				)}
			</div>
		</>
	);
}

/**
 * Shown to a signed-in user with no apiary yet — a fresh Google sign-in, or the
 * production demo account. Deliberately not a redirect: see the call site.
 */
function NoApiary({ firstName }: { firstName: string }) {
	return (
		<>
			<Topbar
				apiaryName='Brak pasieki'
				location=''
			/>

			<div className='relative isolate flex flex-1 items-center justify-center overflow-hidden p-6'>
				<HoneycombBackdrop
					tile={64}
					opacity={0.1}
					fade='center'
				/>

				<div className='max-w-sm text-center'>
					<h1 className='mb-2 text-[22px] font-semibold tracking-[-0.02em] text-foreground lg:text-[20px]'>
						Witaj, {firstName}
					</h1>
					<p className='text-[14px] text-muted lg:text-[13px]'>
						Nie masz jeszcze pasieki. Gdy ją założysz, pojawią się tu Twoje ule, ich siła i przeglądy wymagające uwagi.
					</p>
				</div>
			</div>
		</>
	);
}
