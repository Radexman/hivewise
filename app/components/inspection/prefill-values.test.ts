import { describe, expect, it } from 'vitest';

import type { InspectionDraft } from '@/types/inspection-draft';

import { buildInitialValues, prefilledKeys, type InspectionPrefill } from './prefill-values';

const prefill: InspectionPrefill = {
	queen: {
		queen_status: 'seen',
		queen_marked: true,
		queen_marker_color: 'blue',
		queen_cells: 'none',
		queen_cells_count: 0,
	},
	brood: { brood_types: ['eggs'], brood_pattern: 5 },
	colony: { frames_covered: 9, behavior: 'calm', hive_space: 'ok' },
	comb: { frame_type: 'wielkopolska', slots: 10, low_confidence: false, frames: [] },
	health: { condition_observed: false, conditions: [], varroa_drop_count: null, health_other: '' },
	actions: { selected: ['feeding_syrup'], other: '' },
};

const draft: InspectionDraft = {
	values: { queen_status: 'missing', brood_pattern: 2 },
	savedStep: 3,
	savedAt: Date.now(),
};

describe('buildInitialValues', () => {
	it('returns an empty object when there is neither draft nor prefill', () => {
		expect(buildInitialValues(null, null)).toEqual({});
	});

	it('flattens every prefill section, but never carries notes', () => {
		const values = buildInitialValues(prefill, null);

		expect(values.queen_status).toBe('seen');
		expect(values.queen_marker_color).toBe('blue');
		expect(values.brood_pattern).toBe(5);
		expect(values.frames_covered).toBe(9);
		expect(values.selected).toEqual(['feeding_syrup']);
		expect('notes' in values).toBe(false);
	});

	it('lets a draft win over prefill entirely', () => {
		expect(buildInitialValues(prefill, draft)).toBe(draft.values);
	});
});

describe('prefilledKeys', () => {
	it('names every field taken from the previous inspection', () => {
		const keys = prefilledKeys(prefill, null);

		expect(keys.has('queen_status')).toBe(true);
		expect(keys.has('frames_covered')).toBe(true);
		expect(keys.has('selected')).toBe(true);
		expect(keys.has('notes')).toBe(false);
	});

	it('is empty when the values came from a draft', () => {
		expect(prefilledKeys(prefill, draft).size).toBe(0);
	});

	it('is empty when there is no previous inspection', () => {
		expect(prefilledKeys(null, null).size).toBe(0);
	});

	it('does not mark a field whose column was null', () => {
		const sparse: InspectionPrefill = { ...prefill, actions: null };
		expect(prefilledKeys(sparse, null).has('selected')).toBe(false);
	});
});
