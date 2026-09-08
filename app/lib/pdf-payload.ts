import type { Prisma } from '@/generated/prisma/client';
import apiaryProfile from '@/apiary.json';
import type { ActionsData, BroodData, ColonyData, CombData, HealthData, QueenData } from '@/types/inspection';

/**
 * The row shape `buildPdfPayload` needs: an inspection with its hive and the
 * hive's apiary name/location. `/api/inspections/[inspectionId]/pdf` loads
 * exactly this.
 */
export type InspectionForPdf = Prisma.InspectionGetPayload<{
	include: { hive: { include: { apiary: { select: { name: true; location: true } } } } };
}>;

interface PdfPayloadOptions {
	/** Falls back to apiary.json — the row does not record who ran the inspection. */
	beekeeperName?: string | null;
	/** Which inspection this is for the hive, 1-based. Not stored on the row. */
	inspectionNumber: number;
}

function emptyToNull(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

// `brood_pattern` used to be a string enum; the form and the PDF microservice
// both take a 1–5 integer now. Map the two legacy values the way the app's own
// voice parser does (see `PATTERN_WORDS` in `brood.voice.ts`): a "solid" comb
// reads as a full 5, a "spotty" one as 2. Seeded demo inspections still carry
// the strings — see `scripts/seed-demo.ts`.
const LEGACY_BROOD_PATTERN: Record<string, number> = { solid: 5, spotty: 2 };

function normalizeBroodPattern(value: BroodData['brood_pattern'] | string): number {
	if (typeof value === 'number') return value;
	return LEGACY_BROOD_PATTERN[value] ?? 1; // 1 is the schema floor
}

// Legacy rows store `null` when there are no queen cells; the current schema
// defaults it to 0 and the microservice wants an integer either way.
function normalizeQueenCellsCount(value: QueenData['queen_cells_count'] | null | undefined): number {
	return typeof value === 'number' ? value : 0;
}

/**
 * Assembles the JSON body the PDF microservice expects from a *persisted*
 * `Inspection` row — the on-demand "last inspection" PDF on the hive detail
 * page.
 *
 * This produces the **same shape** as `buildInspectionPayload` in
 * `app/components/inspection/payload.ts`, which drives the mid-wizard PDF. The
 * extension spec sketched a flatter shape, but that would need the microservice
 * redeployed first; matching the working contract keeps this self-contained.
 *
 * `queen` / `brood` / `colony` are mostly pass-through; `comb`, `health`,
 * `actions` and `notes` are reshaped to match what the wizard sends
 * (`schema_version` added, empty/absent free-text collapsed to `null`).
 * `meta.beekeeper_name` / `veterinary_number` / `inspection_number` are not on
 * the row — they come from `apiary.json` and the caller. `weather` is never
 * persisted, so it is always `null`.
 *
 * Two schema generations are handled because both are in the wild:
 * - `health` / `actions` free-text: the current form writes `health.health_other`
 *   as a string (plus `condition_observed`); `scripts/seed-demo.ts` writes the
 *   microservice shape directly (`health.other`, nullable, no `condition_observed`).
 * - `brood_pattern` and `queen_cells_count`: see the normalizers above.
 */
export function buildPdfPayload(inspection: InspectionForPdf, options: PdfPayloadOptions) {
	const queen = inspection.queen as QueenData;
	const brood = inspection.brood as Omit<BroodData, 'brood_pattern'> & {
		brood_pattern: BroodData['brood_pattern'] | string;
	};
	const colony = inspection.colony as ColonyData;
	const comb = inspection.comb as CombData;
	const health = inspection.health as {
		conditions: HealthData['conditions'];
		varroa_drop_count: HealthData['varroa_drop_count'];
		health_other?: string | null;
		other?: string | null;
	};
	const actions = inspection.actions as {
		selected: ActionsData['selected'];
		other?: string | null;
	};

	return {
		meta: {
			apiary_name: inspection.hive.apiary.name,
			beekeeper_name: options.beekeeperName?.trim() || apiaryProfile.beekeeper_name,
			veterinary_number: apiaryProfile.veterinary_number,
			hive_number: inspection.hive.label,
			inspection_number: String(options.inspectionNumber),
			inspection_date: inspection.inspectedAt.toISOString().slice(0, 10),
		},
		weather: null,
		queen: {
			queen_status: queen.queen_status,
			queen_marked: queen.queen_marked,
			queen_marker_color: queen.queen_marker_color,
			queen_cells: queen.queen_cells,
			queen_cells_count: normalizeQueenCellsCount(queen.queen_cells_count),
		},
		brood: {
			brood_types: brood.brood_types,
			brood_pattern: normalizeBroodPattern(brood.brood_pattern),
		},
		colony: {
			frames_covered: colony.frames_covered,
			behavior: colony.behavior,
			hive_space: colony.hive_space,
		},
		comb: {
			schema_version: inspection.combSchemaVersion,
			frame_type: comb.frame_type,
			slots: comb.slots,
			low_confidence: comb.low_confidence,
			// Positions renumbered from list order, matching the wizard payload —
			// the box is read left to right.
			frames: comb.frames.map((frame, index) => ({
				position: index + 1,
				comb_state: frame.comb_state,
				brood: frame.brood,
				honey: frame.honey,
				pollen: frame.pollen,
				wear: frame.wear ?? null,
			})),
		},
		actions: {
			selected: actions.selected,
			other: emptyToNull(actions.other),
		},
		health: {
			conditions: health.conditions,
			varroa_drop_count: health.varroa_drop_count,
			other: emptyToNull(health.other ?? health.health_other),
		},
		notes: emptyToNull(inspection.notes),
	};
}
