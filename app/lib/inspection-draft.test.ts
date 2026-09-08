// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { DRAFT_TTL_MS, clearDraft, draftKey, formatDraftAge, loadDraft, saveDraft } from './inspection-draft';

afterEach(() => {
	localStorage.clear();
});

describe('draftKey', () => {
	it('scopes the key to the hive id', () => {
		expect(draftKey('hive-1')).toBe('hivewise:draft:hive-1');
		expect(draftKey('hive-2')).not.toBe(draftKey('hive-1'));
	});
});

describe('saveDraft / loadDraft', () => {
	it('round-trips values and step, stamping savedAt', () => {
		const before = Date.now();
		saveDraft('hive-1', { values: { queen_status: 'seen', brood_pattern: 4 }, savedStep: 2 });
		const loaded = loadDraft('hive-1');

		expect(loaded?.values).toEqual({ queen_status: 'seen', brood_pattern: 4 });
		expect(loaded?.savedStep).toBe(2);
		expect(loaded?.savedAt).toBeGreaterThanOrEqual(before);
	});

	it('keeps drafts for different hives apart', () => {
		saveDraft('hive-1', { values: { brood_pattern: 1 }, savedStep: 0 });
		saveDraft('hive-2', { values: { brood_pattern: 5 }, savedStep: 4 });

		expect(loadDraft('hive-1')?.values).toEqual({ brood_pattern: 1 });
		expect(loadDraft('hive-2')?.values).toEqual({ brood_pattern: 5 });
	});

	it('returns null when nothing is stored', () => {
		expect(loadDraft('nope')).toBeNull();
	});

	it('discards and removes a draft past the 24h TTL', () => {
		saveDraft('hive-1', { values: { brood_pattern: 3 }, savedStep: 1 });

		const future = Date.now() + DRAFT_TTL_MS + 1;
		expect(loadDraft('hive-1', future)).toBeNull();
		// The stale entry is cleared, not just skipped.
		expect(localStorage.getItem(draftKey('hive-1'))).toBeNull();
	});

	it('keeps a draft that is exactly at the TTL boundary', () => {
		saveDraft('hive-1', { values: { brood_pattern: 3 }, savedStep: 1 });
		const stored = loadDraft('hive-1')!;

		expect(loadDraft('hive-1', stored.savedAt + DRAFT_TTL_MS)).not.toBeNull();
	});

	it('drops a structurally invalid entry', () => {
		localStorage.setItem(draftKey('hive-1'), JSON.stringify({ foo: 'bar' }));
		expect(loadDraft('hive-1')).toBeNull();
		expect(localStorage.getItem(draftKey('hive-1'))).toBeNull();
	});

	it('returns null for malformed JSON without throwing', () => {
		localStorage.setItem(draftKey('hive-1'), '{not json');
		expect(loadDraft('hive-1')).toBeNull();
	});
});

describe('clearDraft', () => {
	it('removes a stored draft', () => {
		saveDraft('hive-1', { values: {}, savedStep: 0 });
		clearDraft('hive-1');
		expect(loadDraft('hive-1')).toBeNull();
	});

	it('is a no-op when there is nothing to clear', () => {
		expect(() => clearDraft('hive-1')).not.toThrow();
	});
});

describe('formatDraftAge', () => {
	const at = (ms: number) => formatDraftAge(0, ms);

	it('reads "chwili" under a minute', () => {
		expect(at(0)).toBe('chwili');
		expect(at(59_000)).toBe('chwili');
	});

	it('uses genitive singular at exactly one unit', () => {
		expect(at(60_000)).toBe('minuty');
		expect(at(60 * 60_000)).toBe('godziny');
		expect(at(24 * 60 * 60_000)).toBe('doby');
	});

	it('uses the plural genitive otherwise', () => {
		expect(at(15 * 60_000)).toBe('15 minut');
		expect(at(3 * 60 * 60_000)).toBe('3 godzin');
		expect(at(2 * 24 * 60 * 60_000)).toBe('2 dni');
	});
});
