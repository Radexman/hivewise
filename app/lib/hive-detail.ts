import type { HiveType } from '@/generated/prisma/client';
import type { BroodData, HealthData, QueenData } from '@/types/inspection';

/**
 * Derivations for the hive detail page (`/hive/[hiveId]`), as pure functions.
 *
 * The same rule as `app/lib/dashboard.ts`: nothing here reads a database or the
 * clock on its own, so every branch is unit-testable. `now` is passed in where
 * a window has to be measured.
 *
 * The spec's snippets assumed shapes the inspection form does not actually
 * write — `brood` as four booleans, `health.issues_observed`, a two-value
 * `queen_cells`. Everything below is derived from the real schema types in
 * `types/inspection.ts`, which are themselves derived from the step schemas.
 */

/** Shown by every stat card when the hive has never been inspected. */
export const EMPTY = '—';

/** Noun form of each hive type, for the hero meta line. */
export const HIVE_TYPE_LABEL: Record<HiveType, string> = {
	WIELKOPOLSKI: 'Ramka wielkopolska',
	DADANT: 'Dadant',
	LANGSTROTH: 'Langstroth',
	WARRE: 'Warré',
	LAYENS: 'Layens',
	OTHER: 'Inny typ',
};

const QUEEN_STAT_LABEL: Record<QueenData['queen_status'], string> = {
	seen: 'Widziana',
	not_seen_brood_ok: 'Niewidziana, OK',
	missing: 'Brak matki',
};

/** The colour the queen stat card tints its value with, matching the dashboard. */
export type QueenStatTone = 'ok' | 'warning' | 'danger' | 'muted';

export function deriveQueenStat(queen: QueenData | null): { label: string; tone: QueenStatTone } {
	if (!queen) {
		return { label: EMPTY, tone: 'muted' };
	}

	const tone: QueenStatTone =
		queen.queen_status === 'missing' ? 'danger' : queen.queen_status === 'not_seen_brood_ok' ? 'warning' : 'ok';

	return { label: QUEEN_STAT_LABEL[queen.queen_status], tone };
}

type BroodType = BroodData['brood_types'][number];

const BROOD_TYPE_LABEL: Record<BroodType, string> = {
	eggs: 'jaja',
	open: 'otwarty',
	capped: 'kryty',
	drone: 'trutowy',
};

/** Fixed order so "jaja + kryty" never renders as "kryty + jaja". */
const BROOD_ORDER: readonly BroodType[] = ['eggs', 'open', 'capped', 'drone'];

export function deriveBroodSummary(brood: BroodData | null): string {
	if (!brood || brood.brood_types.length === 0) {
		return EMPTY;
	}

	return BROOD_ORDER.filter((type) => brood.brood_types.includes(type))
		.map((type) => BROOD_TYPE_LABEL[type])
		.join(' + ');
}

// pl-PL renders the separator as a comma, so 4.2 → "4,2" — the spec's "~4,2 kg".
const HONEY_FORMAT = new Intl.NumberFormat('pl-PL', {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

export function deriveHoneyLabel(honeyKg: number | null | undefined): string {
	return honeyKg != null ? `~${HONEY_FORMAT.format(honeyKg)} kg` : EMPTY;
}

// "8 cze" — the chart axis, which has no room for the year the hero shows.
const CHART_DATE_FORMAT = new Intl.DateTimeFormat('pl-PL', {
	day: 'numeric',
	month: 'short',
	timeZone: 'Europe/Warsaw',
});

export function formatChartDate(date: Date): string {
	return CHART_DATE_FORMAT.format(date);
}

export type HistoryBadgeTone = 'ok' | 'warning' | 'danger';

/**
 * The queen badge on a history row. Ordered by severity, matching
 * `deriveHiveStatus` in `dashboard.ts` — `missing` outranks visible swarm
 * cells, which outrank an unseen-but-laying queen.
 */
export function deriveHistoryQueenBadge(queen: QueenData | null): { label: string; tone: HistoryBadgeTone } {
	if (!queen) {
		return { label: 'Brak danych', tone: 'warning' };
	}

	if (queen.queen_status === 'missing') {
		return { label: 'Brak matki', tone: 'danger' };
	}

	if (queen.queen_cells === 'swarm' || queen.queen_cells === 'emergency') {
		return { label: 'Mateczniki', tone: 'warning' };
	}

	if (queen.queen_status === 'not_seen_brood_ok') {
		return { label: 'Matka niewidz.', tone: 'warning' };
	}

	return { label: 'OK', tone: 'ok' };
}

/** True when the inspection recorded any health concern. */
export function healthHasIssues(health: HealthData | null): boolean {
	if (!health) {
		return false;
	}

	return health.condition_observed || health.conditions.length > 0;
}

/**
 * Free accounts see this many days of history in the chart and the list;
 * Premium accounts see everything. Kept here so the page query and any test
 * agree on the window.
 */
export const FREE_HISTORY_WINDOW_DAYS = 90;

export function freeHistoryCutoff(now: Date): Date {
	return new Date(now.getTime() - FREE_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}
