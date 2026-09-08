import type { FormValues } from '@/app/components/inspection/schema';

/**
 * An in-progress inspection, persisted to localStorage on every step advance so
 * a reload — or a phone that sleeps mid-hive — does not cost the whole visit.
 *
 * `values` is a *partial* `FormValues`: the beekeeper may have answered only the
 * first few steps. `savedStep` is the step index they had reached, so "Wznów"
 * can drop them back where they left off rather than at step 1. `savedAt` is a
 * plain timestamp — `loadDraft` discards anything older than a day.
 *
 * This is deliberately flat-with-meta rather than the section-nested shape the
 * original spec sketched: the form schema (`app/components/inspection/schema.ts`)
 * is one flat object, and a draft that mirrors it can be handed straight to
 * `react-hook-form`'s `reset()`.
 */
export interface InspectionDraft {
	values: Partial<FormValues>;
	savedStep: number;
	savedAt: number;
}
