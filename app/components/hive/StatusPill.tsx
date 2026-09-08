import type { HiveStatus } from '@/app/components/dashboard/status';

/**
 * The hero's health pill. Same three-way signal as the dashboard card edges
 * (`deriveHiveStatus`), shown here as a labelled pill rather than a border.
 */
const PILL_BASE = 'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium';

const PILL_BY_STATUS: Record<HiveStatus, string> = {
	ok: 'bg-accent/12 text-accent',
	warning: 'bg-accent-warm/12 text-accent-warm',
	danger: 'bg-danger/12 text-danger',
};

const DOT_BY_STATUS: Record<HiveStatus, string> = {
	ok: 'bg-accent',
	warning: 'bg-accent-warm',
	danger: 'bg-danger',
};

const LABEL_BY_STATUS: Record<HiveStatus, string> = {
	ok: 'Stan dobry',
	warning: 'Wymaga uwagi',
	danger: 'Alarm',
};

/** `uninspected` mutes the pill so a hive with no data cannot read as healthy. */
export function StatusPill({ status, uninspected = false }: { status: HiveStatus; uninspected?: boolean }) {
	if (uninspected) {
		return (
			<span className={`${PILL_BASE} bg-subtle/15 text-muted`}>
				<span className='h-1.5 w-1.5 rounded-full bg-subtle' />
				Brak przeglądów
			</span>
		);
	}

	return (
		<span className={`${PILL_BASE} ${PILL_BY_STATUS[status]}`}>
			<span className={`h-1.5 w-1.5 rounded-full ${DOT_BY_STATUS[status]}`} />
			{LABEL_BY_STATUS[status]}
		</span>
	);
}
