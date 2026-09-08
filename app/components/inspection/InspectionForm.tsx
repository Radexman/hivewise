'use client';

import { Steps, useSteps, type UseStepsReturn } from '@ark-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormProvider, useForm, type DefaultValues, type FieldErrors, type FieldPath } from 'react-hook-form';

import { fetchCurrentWeather, type InspectionWeather } from '../../lib/inspection-context';
import { saveDraft } from '../../lib/inspection-draft';
import { releaseAllScrollLocks } from '../../lib/scroll-lock';
import { useInspectionDialogue } from '../../lib/voice/useInspectionDialogue';
import { runCombStep } from '../../lib/voice/runCombStep';
import { CombViewContext } from './comb-view';
import { renumberFrames, type FrameValues } from './steps/comb/comb.schema';
import type { FieldValues } from '../../lib/voice/fieldScript';
import { VoicePanel } from './VoicePanel';
import type { Beehive } from '../../lib/beehives';
import { buildInspectionPayload } from './payload';
import { PrefillProvider } from './prefill';
import type { SubmitInspectionResult } from './submit-inspection';
import { buildMeta } from './summary.helpers';
import { defaultValues, fullSchema, STEP_META, stepFields, type FormValues } from './schema';
import { describeInvalidSteps, markValidatedSteps, stepOfField, stepsWithErrors } from './validation';
import { StepBrood } from './steps/brood/StepBrood';
import { StepQueen } from './steps/queen/StepQueen';
import { StepColony } from './steps/colony/StepColony';
import { StepComb } from './steps/comb/StepComb';
import { StepActions } from './steps/actions/StepActions';
import { StepNotes } from './steps/notes/StepNotes';
import { StepHealth } from './steps/health/StepHealth';
import { StepSummary, type WeatherState } from './steps/summary/StepSummary';

const PDF_ENDPOINT = '/api/generate-pdf';

function filenameFromDisposition(header: string | null): string | undefined {
	const match = header?.match(/filename="?([^"]+)"?/);
	return match?.[1];
}

/**
 * Keyed by step, not indexed: schema.ts owns the order, and looking components
 * up by key means reordering there cannot leave this list pointing at the wrong
 * step.
 */
const STEP_COMPONENTS: Record<string, () => React.ReactElement> = {
	comb: StepComb,
	queen: StepQueen,
	brood: StepBrood,
	colony: StepColony,
	health: StepHealth,
	actions: StepActions,
	notes: StepNotes,
};

const SUMMARY_META = { key: 'summary', title: 'Podsumowanie' };
const ALL_STEPS = [...STEP_META, SUMMARY_META];
const SUMMARY_INDEX = STEP_META.length;
const TOTAL_STEPS = STEP_META.length + 1;

export function InspectionForm({
	hive,
	onBack,
	backLabel = '← Ule',
	hiveLabel,
	initialValues,
	initialStep = 0,
	prefilledFields,
	persistKey,
	onSave,
}: {
	hive: Beehive;
	onBack: () => void;
	/** Text on the top-left return button. */
	backLabel?: string;
	/** Shown in the header and the summary instead of "Ul nr {number}". */
	hiveLabel?: string;
	/** Merged over the schema defaults — a resumed draft or last inspection. */
	initialValues?: Partial<FormValues>;
	/** Step to open on, for resuming a draft. */
	initialStep?: number;
	/** Field names still holding last inspection's value; badged until edited. */
	prefilledFields?: ReadonlySet<string>;
	/** hive id — when set, the form saves a localStorage draft on every step. */
	persistKey?: string;
	/**
	 * When set, the summary submits the inspection to the database through this
	 * action (which redirects on success) instead of downloading a PDF.
	 */
	onSave?: (values: FormValues) => Promise<SubmitInspectionResult>;
}) {
	const methods = useForm<FormValues>({
		resolver: zodResolver(fullSchema),
		defaultValues: (initialValues
			? { ...defaultValues, ...initialValues }
			: defaultValues) as DefaultValues<FormValues>,
		mode: 'onSubmit',
	});

	const [prefilledKeys, setPrefilledKeys] = useState<ReadonlySet<string>>(() => prefilledFields ?? new Set());

	const validatedSteps = useRef<Set<number>>(new Set());
	const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'error'>('idle');
	// Every field-level message is inside a step panel, and the stepper hides
	// every panel but the current one — so anything the beekeeper needs to read
	// from the summary has to be said out here.
	const [formError, setFormError] = useState<string | null>(null);
	const [inspectionNumber, setInspectionNumber] = useState(String(hive.nextInspectionNumber));
	const [weather, setWeather] = useState<InspectionWeather | null>(null);
	const [weatherState, setWeatherState] = useState<WeatherState>('idle');
	// Comb's visible frame lives here so the spoken dialogue can move it.
	const [activeFrame, setActiveFrame] = useState(0);
	// A finished transcript can be closed without stopping anything.
	const [transcriptDismissed, setTranscriptDismissed] = useState(false);

	// The stepper's own api, needed inside the onStepInvalid it is built with.
	// The callback only ever runs from a click, long after this is filled in.
	const stepsRef = useRef<UseStepsReturn | null>(null);

	const steps = useSteps({
		count: TOTAL_STEPS,
		defaultStep: initialStep,
		// Any navigation that actually happens answers whatever the message said,
		// and is the moment to checkpoint the draft — forwards or back, the data
		// entered so far survives a reload.
		onStepChange: ({ step }) => {
			setFormError(null);
			if (persistKey) saveDraft(persistKey, { values: methods.getValues(), savedStep: step });
		},
		isStepValid: (index) =>
			index === SUMMARY_INDEX ? validatedSteps.current.size >= STEP_META.length : validatedSteps.current.has(index),
		// A refused navigation is silent — the dead submit button in miniature.
		// Re-check the step for real: let it through if it passes, name it if it
		// does not, so the mark can never be more stale than the answer.
		onStepInvalid: ({ step, targetStep }) => {
			void (async () => {
				const fields = stepFields[step];
				if (fields && (await methods.trigger(fields))) {
					validatedSteps.current.add(step);
					if (targetStep === undefined) stepsRef.current?.goToNextStep();
					else stepsRef.current?.setStep(targetStep);
					return;
				}
				setFormError(describeInvalidSteps([step]));
			})();
		},
	});

	useEffect(() => {
		stepsRef.current = steps;
	});

	// A step counts as validated only until its data changes. Without this,
	// editing a section from the summary and returning by the step indicator
	// carries the old mark and the edit is never re-checked.
	useEffect(
		() =>
			methods.subscribe({
				formState: { values: true },
				callback: ({ name }) => {
					if (!name) return;
					const index = stepOfField(name);
					if (index >= 0) validatedSteps.current.delete(index);
					// An edited field is no longer "from the previous inspection".
					setPrefilledKeys((prev) => {
						if (!prev.has(name)) return prev;
						const next = new Set(prev);
						next.delete(name);
						return next;
					});
				},
			}),
		[methods],
	);

	// Resuming mid-form: mark the already-walked steps that still validate, so
	// the stepper does not block the jump back to where the beekeeper left off.
	// Hidden panels, so any errors this surfaces are not seen until navigated to.
	useEffect(() => {
		if (initialStep > 0) {
			void markValidatedSteps(initialStep, validatedSteps.current, (fields) => methods.trigger(fields));
		}
	}, [initialStep, methods]);

	const currentStep = steps.value;
	const isLastStep = currentStep === SUMMARY_INDEX;

	// Navigation belongs here, where the stepper lives; step scripts only report
	// whether they finished or want to go back.
	const dialogue = useInspectionDialogue({
		steps: STEP_META,
		startIndex: () => Math.min(steps.value, STEP_META.length - 1),
		goToStep: async (index) => {
			// Everything before the destination has been walked, so record it the
			// way the Dalej button does — which means validating it. Walked is not
			// valid: marking blind unlocks the summary for a spoken step whose
			// answers the schema rejects, and submit then dies with no message.
			await markValidatedSteps(index, validatedSteps.current, (fields) => methods.trigger(fields));
			steps.setStep(index);
		},
		api: {
			getValues: () => methods.getValues() as FieldValues,
			setValue: (name, value) => methods.setValue(name as FieldPath<FormValues>, value as never, { shouldDirty: true }),
		},
		// Comb does not fit the field engine — it loops over frames rather than a
		// fixed list of fields — so it is supplied as a runner on the same runtime.
		runners: {
			comb: (runtime) =>
				runCombStep(runtime, {
					getFrames: () => (methods.getValues('frames') ?? []) as FrameValues[],
					setFrames: (frames) => methods.setValue('frames', renumberFrames(frames), { shouldDirty: true }),
					setSlots: (slots) => methods.setValue('slots', slots, { shouldDirty: true }),
					setActive: setActiveFrame,
				}),
		},
	});

	// The conversation bar is docked rather than overlaid, so the form reserves
	// room for it instead of letting it cover the controls.
	const voiceOpen = dialogue.running || (dialogue.log.length > 0 && !transcriptDismissed);

	// Nothing inside the form may strand a scroll lock on the way out: an
	// unscrollable page hides the step buttons, and the only recovery is a reload
	// that costs the whole inspection.
	useEffect(() => releaseAllScrollLocks, []);

	// Keep the screen on the field being asked. Imperative because scrolling is,
	// and because a ring on one element is not worth threading through every
	// field component as state.
	const voiceField = dialogue.status.fieldName;
	useEffect(() => {
		document.querySelectorAll('[data-voice-active]').forEach((node) => node.removeAttribute('data-voice-active'));
		if (!voiceField) return;
		const target = document.querySelector(`[data-field="${voiceField}"]`);
		if (!target) return;
		target.setAttribute('data-voice-active', '');
		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [voiceField]);

	const loadWeather = useCallback(async () => {
		setWeatherState('loading');
		try {
			const result = await fetchCurrentWeather();
			setWeather(result);
			setWeatherState(result ? 'ready' : 'error');
		} catch (error) {
			console.warn('Weather fetch failed:', error);
			setWeather(null);
			setWeatherState('error');
		}
	}, []);

	const handleNext = async () => {
		const ok = await methods.trigger(stepFields[currentStep]);
		if (!ok) {
			setFormError(describeInvalidSteps([currentStep]));
			return;
		}
		validatedSteps.current.add(currentStep);
		if (currentStep + 1 === SUMMARY_INDEX && weatherState === 'idle') {
			loadWeather();
		}
		steps.goToNextStep();
	};

	const handleEdit = (stepKey: string) => {
		const index = STEP_META.findIndex((meta) => meta.key === stepKey);
		if (index < 0) return;
		steps.setStep(index);
	};

	const reportInvalid = (errors: FieldErrors<FormValues>) => {
		const invalid = stepsWithErrors(errors);
		for (const index of invalid) validatedSteps.current.delete(index);
		setSubmitState('idle');
		// Move first: the navigation clears the message, so it has to be said after.
		if (invalid.length > 0) steps.setStep(invalid[0]);
		setFormError(describeInvalidSteps(invalid));
	};

	const downloadPdf = async (data: FormValues) => {
		setFormError(null);
		setSubmitState('submitting');
		try {
			const context = { meta: buildMeta(hive.number, inspectionNumber), weather };
			const response = await fetch(PDF_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(buildInspectionPayload(data, context)),
			});
			// 401 (session gone) and 429 (rate limited) are the two failures the user
			// can actually do something about, and the route sends a sentence saying
			// what. Everything else stays on the generic banner below, which is all
			// a 500 from the PDF service deserves.
			if (response.status === 401 || response.status === 429) {
				const body: { error?: string } = await response.json().catch(() => ({}));

				if (body.error) {
					setFormError(body.error);
					setSubmitState('idle');
					return;
				}
			}

			if (!response.ok) throw new Error(`Serwer odpowiedział ${response.status}`);

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = filenameFromDisposition(response.headers.get('content-disposition')) ?? 'przeglad.pdf';
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			setSubmitState('idle');
		} catch (error) {
			console.error('PDF generation failed:', error);
			setSubmitState('error');
		}
	};

	// Built on the click rather than during render: handleSubmit only reaches
	// reportInvalid, and its ref, from inside the handler.
	const generatePdf = () => void methods.handleSubmit(downloadPdf, reportInvalid)();

	const saveInspection = async (data: FormValues) => {
		if (!onSave) return;
		setFormError(null);
		setSubmitState('submitting');
		// On success the action redirects (throws NEXT_REDIRECT, which propagates
		// through here and unmounts the form) — control only returns on an error.
		const result = await onSave(data);
		if (result?.error) {
			setFormError(result.error);
			setSubmitState('idle');
		}
	};

	const submitInspection = () => void methods.handleSubmit(saveInspection, reportInvalid)();

	return (
		<CombViewContext.Provider value={{ active: activeFrame, setActive: setActiveFrame }}>
			<FormProvider {...methods}>
				<PrefillProvider keys={prefilledKeys}>
					<form
						onSubmit={(event) => event.preventDefault()}
						className={`mx-auto flex w-full max-w-6xl flex-col gap-8 ${voiceOpen ? 'pb-[46dvh]' : ''}`}
					>
						<div className='flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between'>
							<div className='flex items-center gap-3'>
								<button
									type='button'
									onClick={onBack}
									className='rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2'
								>
									{backLabel}
								</button>
								<span className='text-sm text-foreground'>
									{hiveLabel ? (
										<span className='font-semibold'>{hiveLabel}</span>
									) : (
										<>
											Ul nr <span className='font-semibold'>{hive.number}</span>
										</>
									)}
								</span>
							</div>
							<label className='flex items-center gap-2 text-sm text-muted'>
								Nr przeglądu
								<input
									type='number'
									min={1}
									inputMode='numeric'
									value={inspectionNumber}
									onChange={(event) => setInspectionNumber(event.target.value)}
									className='w-20 rounded-md border border-border bg-surface-2 px-3 py-2 text-foreground outline-none transition-colors focus:border-accent'
								/>
							</label>
						</div>
						<Steps.RootProvider
							value={steps}
							className='flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-10'
						>
							<Steps.List className='flex flex-row gap-1 overflow-x-auto pb-2 sm:w-56 sm:shrink-0 sm:flex-col sm:gap-0 sm:overflow-visible sm:pb-0'>
								{ALL_STEPS.map((meta, index) => (
									<Steps.Item
										key={meta.key}
										index={index}
										className='flex items-center sm:flex-col sm:items-stretch'
									>
										<Steps.Trigger className='group flex items-center gap-3 text-left sm:py-1.5'>
											<Steps.Indicator className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-sm text-muted transition-colors data-current:border-accent data-current:bg-accent data-current:text-background data-complete:border-accent-dim data-complete:bg-accent-dim data-complete:text-foreground'>
												{index + 1}
											</Steps.Indicator>
											<span className='hidden text-sm text-subtle transition-colors group-data-current:text-foreground group-data-complete:text-muted sm:inline'>
												{meta.title}
											</span>
										</Steps.Trigger>
										{index < ALL_STEPS.length - 1 && (
											<Steps.Separator className='mx-3 h-px w-6 flex-none bg-border transition-colors data-complete:bg-accent-dim sm:mx-0 sm:my-1 sm:ml-4.25 sm:h-5 sm:w-px' />
										)}
									</Steps.Item>
								))}
							</Steps.List>
							<div className='flex min-w-0 flex-1 flex-col gap-8'>
								{!isLastStep && (
									<VoicePanel
										title='Sterowanie głosem'
										hint='Odpowiadaj na pytania, potwierdzaj słowem „dalej”. Po sekcji zapytam, czy przejść do kolejnej.'
										supported={dialogue.supported}
										running={dialogue.running}
										listening={dialogue.listening}
										log={dialogue.log}
										error={dialogue.error}
										open={voiceOpen}
										summary={dialogue.status.summary}
										onDismiss={() => setTranscriptDismissed(true)}
										onStart={() => {
											setTranscriptDismissed(false);
											void dialogue.start();
										}}
										onStop={dialogue.stop}
										unsupportedNote='Sterowanie głosem wymaga przeglądarki Chrome (Android). Wypełnij formularz ręcznie.'
									/>
								)}
								{STEP_META.map((meta, index) => {
									const StepComponent = STEP_COMPONENTS[meta.key];
									return (
										<Steps.Content
											key={meta.key}
											index={index}
											className='rounded-lg border border-border bg-surface p-4 sm:p-6'
										>
											<h2 className='mb-4 text-lg font-semibold text-foreground'>{meta.title}</h2>
											<StepComponent />
										</Steps.Content>
									);
								})}
								<Steps.Content
									key={SUMMARY_META.key}
									index={SUMMARY_INDEX}
									className='rounded-lg border border-border bg-surface p-4 sm:p-6'
								>
									<h2 className='mb-4 text-lg font-semibold text-foreground'>{SUMMARY_META.title}</h2>
									<StepSummary
										hiveNumber={hive.number}
										hiveLabel={hiveLabel}
										mode={onSave ? 'save' : 'pdf'}
										inspectionNumber={inspectionNumber}
										weather={weather}
										weatherState={weatherState}
										onRefreshWeather={loadWeather}
										onEdit={handleEdit}
									/>
								</Steps.Content>
								<Steps.CompletedContent className='rounded-lg border border-accent-dim bg-surface p-6 text-foreground'>
									Wszystkie kroki zostały ukończone.
								</Steps.CompletedContent>
								{formError && (
									<p
										role='alert'
										className='rounded-md border border-danger-dim bg-danger/10 px-3 py-2 text-sm text-danger'
									>
										{formError}
									</p>
								)}
								{submitState === 'error' && !onSave && (
									<p
										role='alert'
										className='text-sm text-danger'
									>
										Nie udało się wygenerować PDF. Sprawdź połączenie i spróbuj ponownie.
									</p>
								)}
								<div className='flex justify-between gap-3'>
									<Steps.PrevTrigger className='rounded-md border border-border bg-surface px-4 py-2 text-sm text-muted transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40'>
										Wstecz
									</Steps.PrevTrigger>
									{isLastStep ? (
										<button
											type='button'
											onClick={onSave ? submitInspection : generatePdf}
											disabled={submitState === 'submitting'}
											className='rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-dim hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'
										>
											{onSave
												? submitState === 'submitting'
													? 'Zapisywanie…'
													: 'Zapisz przegląd'
												: submitState === 'submitting'
													? 'Generowanie…'
													: 'Zapisz i pobierz PDF'}
										</button>
									) : (
										<button
											type='button'
											onClick={handleNext}
											className='rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-dim hover:text-foreground'
										>
											Dalej
										</button>
									)}
								</div>
							</div>
						</Steps.RootProvider>
					</form>
				</PrefillProvider>
			</FormProvider>
		</CombViewContext.Provider>
	);
}
