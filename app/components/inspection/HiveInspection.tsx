'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { clearDraft, formatDraftAge } from '../../lib/inspection-draft';
import { useSavedDraft } from '../../lib/use-saved-draft';

import { InspectionForm } from './InspectionForm';
import { buildInitialValues, prefilledKeys, type InspectionPrefill } from './prefill-values';
import { submitInspectionAction } from './submit-inspection';

interface Props {
	hiveId: string;
	hiveLabel: string;
	/** Previous inspection's section values, or null if the hive is new. */
	prefill: InspectionPrefill | null;
	/** Count of prior inspections + 1 — the default "Nr przeglądu". */
	nextInspectionNumber: number;
}

/**
 * Client half of `/inspect/[hiveId]`: resolves any saved draft, offers to resume
 * it, then renders the shared inspection form wired to save into the database.
 *
 * The page component has already done auth and the ownership check; this only
 * deals with the browser — localStorage and navigation.
 */
export function HiveInspection({ hiveId, hiveLabel, prefill, nextInspectionNumber }: Props) {
	const router = useRouter();
	const savedDraft = useSavedDraft(hiveId);
	// null = not decided yet; the resume banner is showing.
	const [choice, setChoice] = useState<'resumed' | 'fresh' | null>(null);

	// An empty draft (form opened, nothing entered, left) is not worth a prompt.
	const hasDraft = !!savedDraft && Object.keys(savedDraft.values).length > 0;

	if (hasDraft && choice === null) {
		return (
			<div className='mx-auto flex w-full max-w-6xl flex-col gap-4 rounded-lg border border-accent-dim bg-surface p-6'>
				<div className='flex flex-col gap-1'>
					<h1 className='text-lg font-semibold text-foreground'>Niezakończony przegląd</h1>
					<p className='text-sm text-muted'>
						Masz zapisany, niezakończony przegląd ula <span className='font-semibold'>{hiveLabel}</span> sprzed{' '}
						{formatDraftAge(savedDraft.savedAt)}. Chcesz go dokończyć?
					</p>
				</div>
				<div className='flex flex-col gap-2 sm:flex-row'>
					<button
						type='button'
						onClick={() => setChoice('resumed')}
						className='rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-dim hover:text-foreground'
					>
						Wznów
					</button>
					<button
						type='button'
						onClick={() => {
							clearDraft(hiveId);
							setChoice('fresh');
						}}
						className='rounded-md border border-border bg-surface px-4 py-2 text-sm text-muted transition-colors hover:bg-surface-2'
					>
						Zacznij od nowa
					</button>
				</div>
			</div>
		);
	}

	// A resumed draft wins over prefill; "Zacznij od nowa" falls back to prefill.
	const resumed = choice === 'resumed' ? savedDraft : null;
	const initialValues = buildInitialValues(prefill, resumed);
	const prefilled = prefilledKeys(prefill, resumed);

	return (
		<InspectionForm
			hive={{ id: hiveId, number: 0, nextInspectionNumber }}
			hiveLabel={hiveLabel}
			backLabel='← Pulpit'
			onBack={() => router.push('/dashboard')}
			initialValues={initialValues}
			initialStep={resumed?.savedStep ?? 0}
			prefilledFields={prefilled}
			persistKey={hiveId}
			onSave={(values) => submitInspectionAction(hiveId, values)}
		/>
	);
}
