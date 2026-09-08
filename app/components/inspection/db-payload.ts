import type { ActionsValues } from './steps/actions/actions.schema';
import type { BroodValues } from './steps/brood/brood.schema';
import type { ColonyValues } from './steps/colony/colony.schema';
import { deriveComb } from './steps/comb/comb.derive';
import {
	COMB_SCHEMA_VERSION,
	renumberFrames,
	type CombCondition,
	type CombValues,
	type HoneySufficiency,
} from './steps/comb/comb.schema';
import type { HealthValues } from './steps/health/health.schema';
import type { QueenValues } from './steps/queen/queen.schema';
import type { FormValues } from './schema';

/**
 * Turns validated `FormValues` into the columns of an `Inspection` row.
 *
 * The six section objects are stored as-is — `types/inspection.ts` derives the
 * `Json` column types straight from the same step schemas, so what goes in here
 * is exactly what a reader casts back out. The scalar columns (`honeyKg`,
 * `honeySufficiency`, `combCondition`) are derived from the comb frames by
 * `deriveComb`, the same function the summary screen previews — kept in one
 * place so the stored number and the number the beekeeper saw cannot diverge.
 *
 * PDF generation is a separate concern: `payload.ts` builds a different,
 * PDF-service-shaped object and must not be confused with this one.
 */

const SUFFICIENCY_TO_ENUM: Record<HoneySufficiency, 'SUFFICIENT' | 'MODERATE' | 'LOW' | 'NONE'> = {
	sufficient: 'SUFFICIENT',
	moderate: 'MODERATE',
	low: 'LOW',
	none: 'NONE',
};

const CONDITION_TO_ENUM: Record<CombCondition, 'GOOD' | 'OLD' | 'NEEDS_REPLACEMENT'> = {
	good: 'GOOD',
	old: 'OLD',
	needs_replacement: 'NEEDS_REPLACEMENT',
};

export interface InspectionRecord {
	queen: QueenValues;
	colony: ColonyValues;
	comb: CombValues;
	brood: BroodValues;
	health: HealthValues;
	actions: ActionsValues;
	notes: string;
	combSchemaVersion: number;
	honeyKg: number;
	honeySufficiency: 'SUFFICIENT' | 'MODERATE' | 'LOW' | 'NONE';
	combCondition: 'GOOD' | 'OLD' | 'NEEDS_REPLACEMENT';
}

export function buildInspectionRecord(v: FormValues): InspectionRecord {
	const comb = {
		frame_type: v.frame_type,
		slots: v.slots,
		low_confidence: v.low_confidence,
		// Positions follow list order — normalise so a frame moved on the way to
		// submit cannot store a stale index.
		frames: renumberFrames(v.frames),
	};

	const derived = deriveComb(comb);

	return {
		queen: {
			queen_status: v.queen_status,
			queen_marked: v.queen_marked,
			queen_marker_color: v.queen_marker_color,
			queen_cells: v.queen_cells,
			queen_cells_count: v.queen_cells_count,
		},
		colony: {
			frames_covered: v.frames_covered,
			behavior: v.behavior,
			hive_space: v.hive_space,
		},
		comb,
		brood: {
			brood_types: v.brood_types,
			brood_pattern: v.brood_pattern,
		},
		health: {
			condition_observed: v.condition_observed,
			conditions: v.conditions,
			varroa_drop_count: v.varroa_drop_count,
			health_other: v.health_other,
		},
		actions: {
			selected: v.selected,
			other: v.other,
		},
		notes: v.notes.trim(),
		combSchemaVersion: COMB_SCHEMA_VERSION,
		honeyKg: derived.honey_kg,
		honeySufficiency: SUFFICIENCY_TO_ENUM[derived.honey_stores],
		combCondition: CONDITION_TO_ENUM[derived.comb_condition],
	};
}
