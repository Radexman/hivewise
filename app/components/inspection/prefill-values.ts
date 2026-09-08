import type { InspectionDraft } from '@/types/inspection-draft';
import type { ActionsData, BroodData, ColonyData, CombData, HealthData, QueenData } from '@/types/inspection';

import type { FormValues } from './schema';

/**
 * The parts of a previous `Inspection` row this form can pre-populate from.
 * Prisma types every `Json` column as `JsonValue`, so each arrives untyped and
 * is cast to the shape its step schema wrote (see `types/inspection.ts`).
 */
export interface InspectionPrefill {
	queen: unknown;
	brood: unknown;
	colony: unknown;
	comb: unknown;
	health: unknown;
	actions: unknown;
}

/**
 * Last inspection's section values as one flat object, ready to merge over the
 * form defaults. `notes` is deliberately absent — it is written fresh every
 * visit and carrying it forward would be misleading.
 */
function flattenPrefill(prefill: InspectionPrefill): Partial<FormValues> {
	const flat: Record<string, unknown> = {
		...(prefill.queen as QueenData),
		...(prefill.brood as BroodData),
		...(prefill.colony as ColonyData),
		...(prefill.comb as CombData),
		...(prefill.health as HealthData),
		...(prefill.actions as ActionsData),
	};

	// A column that was null/absent spreads to nothing useful; drop stray
	// undefineds so `prefilledKeys` does not mark a field that got no value.
	for (const key of Object.keys(flat)) {
		if (flat[key] === undefined) delete flat[key];
	}

	return flat as Partial<FormValues>;
}

/**
 * Initial form values, in priority order: an unfinished draft wins outright (it
 * is the beekeeper's own most recent work), then last inspection's values, then
 * nothing — the caller merges the result over the schema defaults.
 */
export function buildInitialValues(
	prefill: InspectionPrefill | null,
	draft: InspectionDraft | null,
): Partial<FormValues> {
	if (draft) return draft.values;
	if (!prefill) return {};
	return flattenPrefill(prefill);
}

/**
 * Field names carried over from the last inspection, so the form can badge them
 * "z poprzedniego przeglądu" until the beekeeper confirms or changes each one.
 * Empty when the values came from a draft (a draft is current work, not stale
 * data) or when there is no previous inspection.
 */
export function prefilledKeys(prefill: InspectionPrefill | null, draft: InspectionDraft | null): Set<string> {
	if (draft || !prefill) return new Set();
	return new Set(Object.keys(flattenPrefill(prefill)));
}
