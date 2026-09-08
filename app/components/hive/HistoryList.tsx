import Link from 'next/link';

import { formatInspectionDate } from '@/app/lib/dashboard';
import {
	deriveHistoryQueenBadge,
	deriveHoneyLabel,
	healthHasIssues,
	type HistoryBadgeTone,
} from '@/app/lib/hive-detail';
import type { HealthData, QueenData } from '@/types/inspection';

export interface HistoryInspection {
	id: string;
	inspectedAt: string | Date;
	honeyKg: number | null;
	queen: unknown;
	health: unknown;
	notes: string;
}

interface HistoryListProps {
	/** Ascending by `inspectedAt`, as the page query returns it. */
	inspections: HistoryInspection[];
	isPremium: boolean;
}

const BADGE_BASE = 'shrink-0 rounded-sm px-1.75 py-0.5 text-[11px] font-semibold tracking-[0.03em]';

const BADGE_BY_TONE: Record<HistoryBadgeTone, string> = {
	ok: 'bg-accent/12 text-accent',
	warning: 'bg-accent-warm/12 text-accent-warm',
	danger: 'bg-danger/12 text-danger',
};

function Badge({ tone, children }: { tone: HistoryBadgeTone; children: string }) {
	return <span className={`${BADGE_BASE} ${BADGE_BY_TONE[tone]}`}>{children}</span>;
}

function HistoryRow({ inspection }: { inspection: HistoryInspection }) {
	const queen = (inspection.queen ?? null) as QueenData | null;
	const health = (inspection.health ?? null) as HealthData | null;
	const queenBadge = deriveHistoryQueenBadge(queen);

	return (
		<div className='history-row flex items-center justify-between gap-3 border-b border-b-border py-3 last:border-b-0'>
			<div className='flex min-w-0 flex-wrap items-center gap-2'>
				<span className='font-mono text-[12px] text-muted'>
					{formatInspectionDate(new Date(inspection.inspectedAt))}
				</span>
				<Badge tone={queenBadge.tone}>{queenBadge.label}</Badge>
				{healthHasIssues(health) && <Badge tone='warning'>Zdrowie</Badge>}
			</div>
			<div className='flex shrink-0 items-center gap-2'>
				{inspection.honeyKg != null && (
					<span className='font-mono text-[12px] text-accent-warm'>{deriveHoneyLabel(inspection.honeyKg)}</span>
				)}
				{inspection.notes.trim() !== '' && (
					<span
						title={inspection.notes}
						aria-label='Notatka'
					>
						📝
					</span>
				)}
			</div>
		</div>
	);
}

export function HistoryList({ inspections, isPremium }: HistoryListProps) {
	if (inspections.length === 0) {
		return <p className='text-[13px] text-muted'>Brak przeglądów dla tego ula.</p>;
	}

	return (
		<div>
			<div>
				{inspections
					.slice()
					.reverse()
					.map((inspection) => (
						<HistoryRow
							key={inspection.id}
							inspection={inspection}
						/>
					))}
			</div>

			{!isPremium && (
				<div className='history-limit-banner mt-3 rounded-[10px] border border-border bg-surface px-3.5 py-3 text-[12px] text-muted'>
					Wyświetlasz przeglądy z ostatnich 3 miesięcy.{' '}
					<Link
						href='/settings/billing'
						className='text-accent hover:underline'
					>
						Przejdź na Premium
					</Link>
					, żeby zobaczyć całą historię.
				</div>
			)}
		</div>
	);
}
