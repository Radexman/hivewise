'use client';

import { useFormContext, useWatch } from 'react-hook-form';

import type { InspectionWeather } from '../../../../lib/inspection-context';
import type { FormValues } from '../../schema';
import { buildMeta, formatDatePl, labelOf, labelsOf } from '../../summary.helpers';
import { QUEEN_CELLS_OPTIONS, QUEEN_MARKER_COLOR_OPTIONS, QUEEN_STATUS_OPTIONS } from '../queen/queen.schema';
import { BROOD_TYPE_OPTIONS } from '../brood/brood.schema';
import { COLONY_BEHAVIOR_OPTIONS, COLONY_HIVE_SPACE_OPTIONS } from '../colony/colony.schema';
import { deriveComb, formatPl } from '../comb/comb.derive';
import { COMB_CONDITION_OPTIONS, HONEY_SUFFICIENCY_OPTIONS } from '../comb/comb.schema';
import { ACTION_OPTIONS } from '../actions/actions.schema';
import { HEALTH_CONDITION_OPTIONS } from '../health/health.schema';

export type WeatherState = 'idle' | 'loading' | 'ready' | 'error';

type SummaryProps = {
	hiveNumber: string | number;
	/** Shown as the "Ul" metadata value when set, in place of the number. */
	hiveLabel?: string;
	/**
	 * `'pdf'` (default) is the standalone wizard: PDF-oriented copy, weather card.
	 * `'save'` is the per-hive flow that writes to the database — no PDF or
	 * weather, since neither is stored.
	 */
	mode?: 'pdf' | 'save';
	inspectionNumber: string | number;
	weather: InspectionWeather | null;
	weatherState: WeatherState;
	onRefreshWeather: () => void;
	onEdit: (stepKey: string) => void;
};

function MetaCard({ label, value }: { label: string; value: string }) {
	return (
		<div className='flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-4'>
			<span className='text-xs uppercase tracking-wide text-subtle'>{label}</span>
			<span className='font-mono text-2xl text-foreground'>{value}</span>
		</div>
	);
}

function WeatherCard({ value, label }: { value: string; label: string }) {
	return (
		<div className='flex flex-col gap-0.5 rounded-lg border border-border bg-surface-2 p-4'>
			<span className='font-mono text-2xl text-foreground'>{value}</span>
			<span className='text-xs text-muted'>{label}</span>
		</div>
	);
}

function Section({
	title,
	stepKey,
	onEdit,
	children,
}: {
	title: string;
	stepKey: string;
	onEdit: (stepKey: string) => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type='button'
			onClick={() => onEdit(stepKey)}
			className='flex w-full flex-col gap-2 rounded-lg border border-border bg-surface-2 p-4 text-left transition-colors hover:border-subtle'
		>
			<div className='flex items-center justify-between'>
				<span className='text-sm font-semibold text-foreground'>{title}</span>
				<span className='flex items-center gap-1 text-xs text-accent'>Edytuj ✎</span>
			</div>
			<dl className='flex flex-col gap-1'>{children}</dl>
		</button>
	);
}

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
	return (
		<div className='flex justify-between gap-3 text-sm'>
			<dt className='flex items-center gap-2 text-muted'>
				{accent && (
					<span
						className='h-2 w-2 shrink-0 rounded-full'
						style={{ background: accent }}
					/>
				)}
				{label}
			</dt>
			<dd className='text-right text-foreground'>{value}</dd>
		</div>
	);
}

function Empty({ text }: { text: string }) {
	return <p className='text-sm text-subtle'>{text}</p>;
}

export function StepSummary({
	hiveNumber,
	hiveLabel,
	mode = 'pdf',
	inspectionNumber,
	weather,
	weatherState,
	onRefreshWeather,
	onEdit,
}: SummaryProps) {
	const { control } = useFormContext<FormValues>();
	const v = useWatch({ control }) as FormValues;

	const meta = buildMeta(hiveNumber, inspectionNumber);
	const isSave = mode === 'save';

	// Recomputed here purely to preview what the service will derive from the frames.
	const comb = deriveComb({
		frame_type: v.frame_type ?? 'wielkopolska',
		slots: v.slots,
		low_confidence: v.low_confidence,
		frames: v.frames ?? [],
	});

	const broodTypes = labelsOf(BROOD_TYPE_OPTIONS, v.brood_types);
	const actions = labelsOf(ACTION_OPTIONS, v.selected);
	const conditions = labelsOf(HEALTH_CONDITION_OPTIONS, v.conditions);

	return (
		<div className='flex flex-col gap-6'>
			<p className='text-sm text-subtle'>
				{isSave
					? 'Sprawdź dane przed zapisaniem przeglądu. Dotknij sekcji, aby ją poprawić.'
					: 'Sprawdź dane przed wygenerowaniem raportu PDF. Dotknij sekcji, aby ją poprawić.'}
			</p>

			<section className='flex flex-col gap-3'>
				<div>
					<h3 className='text-base font-semibold text-foreground'>Metadane</h3>
					<p className='text-sm text-subtle'>Podstawowe dane przeglądu — pobrane automatycznie.</p>
				</div>
				<div className='grid grid-cols-2 gap-3'>
					<MetaCard
						label='Ul'
						value={hiveLabel ?? meta.hive_number}
					/>
					<MetaCard
						label='Data'
						value={formatDatePl(meta.inspection_date)}
					/>
				</div>
			</section>

			{!isSave && (
				<section className='flex flex-col gap-3'>
					<div className='flex items-center justify-between'>
						<h3 className='text-sm font-semibold text-muted'>Pogoda (auto z API)</h3>
						<button
							type='button'
							onClick={onRefreshWeather}
							disabled={weatherState === 'loading'}
							className='rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-3 disabled:opacity-50'
						>
							{weatherState === 'loading' ? 'Pobieranie…' : '↻ Odśwież'}
						</button>
					</div>
					{weatherState === 'loading' && <Empty text='Pobieranie danych pogodowych…' />}
					{weatherState !== 'loading' && weather && (
						<div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
							<WeatherCard
								value={`${weather.temp}°`}
								label='Temperatura'
							/>
							<WeatherCard
								value={`${weather.humidity}%`}
								label='Wilgotność'
							/>
							<WeatherCard
								value={`${weather.wind}`}
								label='Wiatr km/h'
							/>
							<WeatherCard
								value={`${weather.cloud_cover}%`}
								label='Zachmurzenie'
							/>
						</div>
					)}
					{weatherState !== 'loading' && !weather && (
						<div className='rounded-lg border border-border bg-surface-2 p-4 text-sm text-subtle'>
							Pogoda niedostępna — raport zostanie utworzony bez niej. Spróbuj odświeżyć przy lepszym zasięgu.
						</div>
					)}
				</section>
			)}

			<section className='flex flex-col gap-3'>
				<Section
					title='Matka'
					stepKey='queen'
					onEdit={onEdit}
				>
					<Row
						label='Status'
						value={labelOf(QUEEN_STATUS_OPTIONS, v.queen_status)}
					/>
					{v.queen_status !== 'missing' && (
						<Row
							label='Znakowana'
							value={
								v.queen_marked
									? `Tak${v.queen_marker_color ? ` (${labelOf(QUEEN_MARKER_COLOR_OPTIONS, v.queen_marker_color)})` : ''}`
									: 'Nie'
							}
						/>
					)}
					<Row
						label='Mateczniki'
						value={labelOf(QUEEN_CELLS_OPTIONS, v.queen_cells)}
					/>
					{v.queen_cells && v.queen_cells !== 'none' && (
						<Row
							label='Liczba mateczników'
							value={v.queen_cells_count}
						/>
					)}
				</Section>

				<Section
					title='Czerw'
					stepKey='brood'
					onEdit={onEdit}
				>
					<Row
						label='Stadia'
						value={broodTypes.length ? broodTypes.join(', ') : '—'}
					/>
					<Row
						label='Zwartość'
						value={`${v.brood_pattern ?? '—'} / 5`}
					/>
				</Section>

				<Section
					title='Rodzina'
					stepKey='colony'
					onEdit={onEdit}
				>
					<Row
						label='Obsiadane ramki'
						value={v.frames_covered}
					/>
					<Row
						label='Zachowanie'
						value={labelOf(COLONY_BEHAVIOR_OPTIONS, v.behavior)}
					/>
					<Row
						label='Przestrzeń'
						value={labelOf(COLONY_HIVE_SPACE_OPTIONS, v.hive_space)}
					/>
				</Section>

				<Section
					title='Plastry i zasoby'
					stepKey='comb'
					onEdit={onEdit}
				>
					<Row
						label='Ramki'
						value={`${v.frames?.length ?? 0} z ${v.slots}`}
					/>
					<Row
						label='Czerw'
						accent='var(--comb-brood)'
						value={`${formatPl(comb.brood_frames_equiv)} ramki`}
					/>
					<Row
						label='Miód'
						accent='var(--comb-honey)'
						value={`${formatPl(comb.honey_kg, 2)} kg (${formatPl(comb.honey_frames_equiv)} × ${formatPl(comb.frame_capacity_kg, 2)} kg)`}
					/>
					<Row
						label='Pierzga'
						accent='var(--comb-pollen)'
						value={`${formatPl(comb.pollen_frames_equiv)} ramki`}
					/>
					<Row
						label='Wolne plastry'
						accent='var(--comb-empty)'
						value={`${formatPl(comb.empty_frames_equiv)} ramki`}
					/>
					<Row
						label='Węza'
						value={comb.foundation_frames}
					/>
					<Row
						label='Zapasy miodu'
						value={labelOf(HONEY_SUFFICIENCY_OPTIONS, comb.honey_stores)}
					/>
					<Row
						label='Stan plastrów'
						value={labelOf(COMB_CONDITION_OPTIONS, comb.comb_condition)}
					/>
					{comb.unrated_frames > 0 && (
						<Row
							label='Bez oceny plastra'
							value={`${comb.unrated_frames} ramki`}
						/>
					)}
				</Section>

				<Section
					title='Wykonane działania'
					stepKey='actions'
					onEdit={onEdit}
				>
					{actions.length || v.other?.trim() ? (
						<>
							{actions.length > 0 && (
								<Row
									label='Działania'
									value={actions.join(', ')}
								/>
							)}
							{v.other?.trim() && (
								<Row
									label='Inne'
									value={v.other}
								/>
							)}
						</>
					) : (
						<Empty text='Brak działań' />
					)}
				</Section>

				<Section
					title='Zdrowie rodziny'
					stepKey='health'
					onEdit={onEdit}
				>
					{v.condition_observed ? (
						<>
							<Row
								label='Objawy'
								value={conditions.length ? conditions.join(', ') : '—'}
							/>
							{v.conditions?.includes('varroa') && (
								<Row
									label='Osyp warrozy (24h)'
									value={v.varroa_drop_count ?? '—'}
								/>
							)}
							{v.conditions?.includes('other') && v.health_other?.trim() && (
								<Row
									label='Opis'
									value={v.health_other}
								/>
							)}
						</>
					) : (
						<Empty text='Brak objawów' />
					)}
				</Section>

				<Section
					title='Uwagi'
					stepKey='notes'
					onEdit={onEdit}
				>
					{v.notes?.trim() ? <p className='text-sm text-foreground'>{v.notes}</p> : <Empty text='Brak uwag' />}
				</Section>
			</section>
		</div>
	);
}
