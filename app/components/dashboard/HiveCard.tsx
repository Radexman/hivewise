import Link from 'next/link';

import { StrengthDots } from './StrengthDots';
import { QUEEN_LABELS, type HiveStatus, type QueenStatus } from './status';

/**
 * Three sides here; the top edge is the status accent and is set per status
 * below, for the same reason as `AlertCard` — hover must not repaint it.
 */
const CARD_BASE =
	'flex flex-col gap-3 rounded-[10px] border-r border-b border-l border-r-border border-b-border border-l-border bg-surface p-4 transition-colors hover:border-r-border-2 hover:border-b-border-2 hover:border-l-border-2 lg:gap-2.5 lg:p-3.5';

/** An 'ok' hive keeps the plain 1px hairline, so its top edge hovers like the rest. */
const CARD_TOP_EDGE: Record<HiveStatus, string> = {
	ok: 'border-t border-t-border hover:border-t-border-2',
	warning: 'border-t-2 border-t-accent-warm',
	danger: 'border-t-2 border-t-danger',
};

const STATUS_DOT: Record<HiveStatus, string> = {
	ok: 'bg-accent',
	warning: 'bg-accent-warm',
	danger: 'bg-danger',
};

const QUEEN_LABEL_COLOR: Record<QueenStatus, string> = {
	seen: 'text-accent',
	not_seen_brood_ok: 'text-accent-warm',
	missing: 'text-danger',
};

/**
 * A hive with no inspection has no queen state to report — that is the absence
 * of a reading, not a fourth `QueenStatus`. Both the label and the status dot
 * go muted so an uninspected hive cannot be mistaken for a healthy one, which
 * a green 'ok' dot would do.
 */
const NO_INSPECTION_LABEL = 'Brak przeglądów';
const NO_INSPECTION_COLOR = 'text-muted';
const NO_INSPECTION_DOT = 'bg-subtle';

/**
 * Sized for a gloved thumb outdoors, then relaxed to the mock's compact 11px
 * row at `lg`. "Przegląd" is the action this whole screen exists to launch, so
 * it gets 48px to "Szczegóły"'s 44 and sits lowest — nearest the thumb.
 */
const BTN_BASE =
	'inline-flex flex-1 cursor-pointer items-center justify-center rounded-md border text-[14px] transition-colors lg:min-h-0 lg:py-1.25 lg:text-[11px]';
const BTN_GHOST =
	'min-h-11 border-border-2 bg-transparent font-medium text-muted hover:border-border-3 hover:text-foreground';
const BTN_PRIMARY = 'min-h-12 border-transparent bg-accent font-semibold text-background hover:bg-accent-hover';

export interface HiveCardProps {
	/** Prisma `Hive.id` — the target of the "Przegląd" link. */
	hiveId: string;
	/** The hive's own label, e.g. "Ul 1" — user data, rendered as written. */
	label: string;
	/** `null` when the hive has never been inspected. */
	queenStatus: QueenStatus | null;
	/** 0–5. 0 renders as five empty dots. */
	strength: number;
	lastInspection: string;
	status: HiveStatus;
}

export function HiveCard({ hiveId, label, queenStatus, strength, lastInspection, status }: HiveCardProps) {
	const uninspected = queenStatus === null;

	return (
		<article className={`${CARD_BASE} ${CARD_TOP_EDGE[status]}`}>
			<div className='flex items-start justify-between gap-2'>
				<div className='min-w-0'>
					<p className='truncate font-mono text-[26px] font-semibold tracking-[-0.03em] text-foreground lg:text-[22px]'>
						{label}
					</p>
					<p
						className={`mt-0.5 text-[13px] lg:text-[11px] ${uninspected ? NO_INSPECTION_COLOR : QUEEN_LABEL_COLOR[queenStatus]}`}
					>
						{uninspected ? NO_INSPECTION_LABEL : QUEEN_LABELS[queenStatus]}
					</p>
				</div>
				<span
					className={`mt-2 h-2.25 w-2.25 shrink-0 rounded-full lg:mt-1.5 lg:h-1.75 lg:w-1.75 ${
						uninspected ? NO_INSPECTION_DOT : STATUS_DOT[status]
					}`}
				/>
			</div>

			<StrengthDots
				value={strength}
				variant={status}
			/>

			{/* mt-auto keeps the footers aligned when a longer queen label makes one
			    card in the row taller than its neighbours. */}
			<div className='mt-auto flex flex-col gap-2 lg:gap-1.5'>
				<p className='font-mono text-[12px] text-muted lg:text-[10px]'>{lastInspection}</p>
				{/* Stacked on phones: side by side inside a half-width card leaves each
				    button too narrow to hit reliably. */}
				<div className='flex flex-col gap-2 lg:flex-row lg:gap-1.5'>
					<Link
						href={`/hive/${hiveId}`}
						className={`${BTN_BASE} ${BTN_GHOST}`}
					>
						Szczegóły
					</Link>
					<Link
						href={`/inspect/${hiveId}`}
						className={`${BTN_BASE} ${BTN_PRIMARY}`}
					>
						Przegląd
					</Link>
				</div>
			</div>
		</article>
	);
}
