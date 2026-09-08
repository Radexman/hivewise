import type { InspectionDraft } from '@/types/inspection-draft';

/**
 * localStorage-backed draft of an in-progress inspection.
 *
 * The key is scoped to the hive so two hives inspected in one sitting keep
 * separate drafts. Every read and write is wrapped: private-mode Safari throws
 * on `localStorage` access outright, and a page that cannot persist a draft must
 * still let the beekeeper fill the form.
 */

const KEY_PREFIX = 'hivewise:draft:';

/** Drafts older than this are treated as abandoned and dropped on read. */
export const DRAFT_TTL_MS = 1000 * 60 * 60 * 24;

export function draftKey(hiveId: string): string {
	return `${KEY_PREFIX}${hiveId}`;
}

export function saveDraft(hiveId: string, draft: Omit<InspectionDraft, 'savedAt'>): void {
	try {
		const payload: InspectionDraft = { ...draft, savedAt: Date.now() };
		localStorage.setItem(draftKey(hiveId), JSON.stringify(payload));
	} catch {
		// localStorage unavailable (private mode, quota, disabled) — drafts are a
		// convenience, not a requirement.
	}
}

export function loadDraft(hiveId: string, now: number = Date.now()): InspectionDraft | null {
	try {
		const raw = localStorage.getItem(draftKey(hiveId));
		if (!raw) return null;

		const parsed = JSON.parse(raw) as Partial<InspectionDraft>;

		if (
			!parsed ||
			typeof parsed.savedAt !== 'number' ||
			typeof parsed.savedStep !== 'number' ||
			typeof parsed.values !== 'object' ||
			parsed.values === null
		) {
			clearDraft(hiveId);
			return null;
		}

		if (now - parsed.savedAt > DRAFT_TTL_MS) {
			clearDraft(hiveId);
			return null;
		}

		return { values: parsed.values, savedStep: parsed.savedStep, savedAt: parsed.savedAt };
	} catch {
		return null;
	}
}

export function clearDraft(hiveId: string): void {
	try {
		localStorage.removeItem(draftKey(hiveId));
	} catch {
		// See saveDraft.
	}
}

/**
 * Genitive-case age for the resume banner: "Masz niezakończony przegląd sprzed
 * {formatDraftAge(...)}." The strings are the forms that follow "sprzed".
 */
export function formatDraftAge(savedAt: number, now: number = Date.now()): string {
	const seconds = Math.max(0, Math.round((now - savedAt) / 1000));

	if (seconds < 60) return 'chwili';

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return minutes === 1 ? 'minuty' : `${minutes} minut`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return hours === 1 ? 'godziny' : `${hours} godzin`;

	const days = Math.floor(hours / 24);
	return days === 1 ? 'doby' : `${days} dni`;
}
