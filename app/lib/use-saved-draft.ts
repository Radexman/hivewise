'use client';

import { useSyncExternalStore } from 'react';

import type { InspectionDraft } from '@/types/inspection-draft';

import { draftKey, loadDraft } from './inspection-draft';

// getSnapshot has to return a stable reference while the stored string is
// unchanged, or useSyncExternalStore re-renders in a loop. Cache the parsed
// draft against the raw string it came from, per hive.
const cache = new Map<string, { raw: string | null; value: InspectionDraft | null }>();

function readDraft(hiveId: string): InspectionDraft | null {
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(draftKey(hiveId));
	} catch {
		raw = null;
	}

	const cached = cache.get(hiveId);
	if (cached && cached.raw === raw) return cached.value;

	const value = loadDraft(hiveId);
	cache.set(hiveId, { raw, value });
	return value;
}

const subscribe = () => () => {};

/**
 * The saved draft for a hive, read on mount.
 *
 * The server render — and the first client paint — see `null`; the real value
 * arrives after hydration with no mismatch, which is what `useSyncExternalStore`
 * is for. Nothing subscribes: the draft only changes through this app's own
 * writes, and the resume prompt is a one-time decision made when the form mounts.
 */
export function useSavedDraft(hiveId: string): InspectionDraft | null {
	return useSyncExternalStore(
		subscribe,
		() => readDraft(hiveId),
		() => null,
	);
}
