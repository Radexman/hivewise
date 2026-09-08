'use client';

import { createContext, useContext, useMemo } from 'react';

/**
 * Tracks which fields still hold a value carried over from the last inspection,
 * so the form can badge them as old data until the beekeeper looks at each one.
 *
 * The set is owned by `InspectionForm` and shrinks as fields are edited — a
 * changed field is no longer "from the previous inspection". Consumers read a
 * single boolean, so a replaced set re-renders only the fields whose state
 * actually flipped.
 */

interface PrefillContextValue {
	isPrefilled: (name: string) => boolean;
}

const PrefillContext = createContext<PrefillContextValue>({ isPrefilled: () => false });

export function PrefillProvider({ keys, children }: { keys: ReadonlySet<string>; children: React.ReactNode }) {
	const value = useMemo<PrefillContextValue>(() => ({ isPrefilled: (name) => keys.has(name) }), [keys]);
	return <PrefillContext.Provider value={value}>{children}</PrefillContext.Provider>;
}

export function usePrefilled(name: string): boolean {
	return useContext(PrefillContext).isPrefilled(name);
}

/** The inline "still showing last visit's answer" note next to a field label. */
export function PrefillNote({ name }: { name: string }) {
	if (!usePrefilled(name)) return null;
	return <span className='font-normal text-subtle'> · z poprzedniego przeglądu</span>;
}
