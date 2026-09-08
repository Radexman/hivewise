import { describe, expect, it } from 'vitest';

import { buildInspectionRecord } from './db-payload';
import { makeFrame } from './steps/comb/comb.schema';
import type { FormValues } from './schema';

/** A complete, schema-valid inspection: calm queenright colony, light stores. */
function baseValues(overrides: Partial<FormValues> = {}): FormValues {
	return {
		// comb — two drawn frames, one 40% honey, one empty
		frame_type: 'wielkopolska',
		slots: 10,
		low_confidence: false,
		frames: [{ ...makeFrame(1), honey: 4 }, makeFrame(2)],
		// queen
		queen_status: 'seen',
		queen_marked: false,
		queen_marker_color: null,
		queen_cells: 'none',
		queen_cells_count: 0,
		// brood
		brood_types: ['eggs', 'capped'],
		brood_pattern: 4,
		// colony
		frames_covered: 8,
		behavior: 'calm',
		hive_space: 'ok',
		// health
		condition_observed: false,
		conditions: [],
		varroa_drop_count: null,
		health_other: '',
		// actions
		selected: [],
		other: '',
		// notes
		notes: '  wszystko w porządku  ',
		...overrides,
	};
}

describe('buildInspectionRecord', () => {
	it('stores each section object under its column name', () => {
		const rec = buildInspectionRecord(baseValues());

		expect(rec.queen).toEqual({
			queen_status: 'seen',
			queen_marked: false,
			queen_marker_color: null,
			queen_cells: 'none',
			queen_cells_count: 0,
		});
		expect(rec.colony).toEqual({ frames_covered: 8, behavior: 'calm', hive_space: 'ok' });
		expect(rec.brood).toEqual({ brood_types: ['eggs', 'capped'], brood_pattern: 4 });
		expect(rec.health).toEqual({
			condition_observed: false,
			conditions: [],
			varroa_drop_count: null,
			health_other: '',
		});
		expect(rec.actions).toEqual({ selected: [], other: '' });
	});

	it('trims the notes column', () => {
		expect(buildInspectionRecord(baseValues()).notes).toBe('wszystko w porządku');
	});

	it('renumbers comb frame positions from list order', () => {
		const rec = buildInspectionRecord(
			baseValues({
				frames: [
					{ ...makeFrame(7), honey: 2 },
					{ ...makeFrame(3), pollen: 1 },
				],
			}),
		);

		expect(rec.comb.frames.map((f) => f.position)).toEqual([1, 2]);
	});

	it('stamps the current comb schema version', () => {
		expect(buildInspectionRecord(baseValues()).combSchemaVersion).toBe(2);
	});

	it('derives honey kg and sufficiency from the frames, not the colony step', () => {
		// 4 tenths of honey over a 2.25kg wielkopolska frame ≈ 0.9kg — below one
		// full frame of stores, so "LOW".
		const rec = buildInspectionRecord(baseValues());

		expect(rec.honeyKg).toBeCloseTo(0.9, 5);
		expect(rec.honeySufficiency).toBe('LOW');
	});

	it('maps NONE when there is no honey at all', () => {
		const rec = buildInspectionRecord(baseValues({ frames: [makeFrame(1), makeFrame(2)] }));
		expect(rec.honeySufficiency).toBe('NONE');
	});

	it('derives comb condition from the worst frame wear', () => {
		const good = buildInspectionRecord(baseValues());
		expect(good.combCondition).toBe('GOOD');

		const worn = buildInspectionRecord(
			baseValues({ frames: [makeFrame(1), { ...makeFrame(2), wear: 'needs_replacement' }] }),
		);
		expect(worn.combCondition).toBe('NEEDS_REPLACEMENT');
	});
});
