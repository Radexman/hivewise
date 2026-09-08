'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatChartDate } from '@/app/lib/hive-detail';

export interface HoneyChartPoint {
	/** Serialised across the RSC boundary, so it may arrive as a string. */
	inspectedAt: string | Date;
	honeyKg: number | null;
}

interface HoneyChartProps {
	inspections: HoneyChartPoint[];
	isPremium: boolean;
}

interface Datum {
	date: string;
	honeyKg: number;
}

const EMPTY_CLASS = 'rounded-[10px] border border-border bg-surface px-4 py-10 text-center';

const noopSubscribe = () => () => {};

/**
 * `false` on the server and the first client render, `true` once hydrated — so
 * the chart mounts only when there is a real DOM for `ResponsiveContainer` to
 * measure. `useSyncExternalStore` rather than an effect keeps this off the
 * "setState in effect" path the lint config rejects.
 */
function useHydrated(): boolean {
	return useSyncExternalStore(
		noopSubscribe,
		() => true,
		() => false,
	);
}

/**
 * Honey estimate over time. `honeyKg` is a scalar column derived when an
 * inspection is submitted, so nothing here unpacks JSON.
 *
 * A client component: Recharts measures the DOM through `ResponsiveContainer`.
 * The `useHydrated` gate keeps the first paint a fixed-height placeholder
 * rather than a zero-size chart, which avoids both a hydration mismatch and the
 * library's "width(0) and height(0)" console warning.
 */
export function HoneyChart({ inspections, isPremium }: HoneyChartProps) {
	const hydrated = useHydrated();

	const data: Datum[] = inspections
		.filter((point): point is HoneyChartPoint & { honeyKg: number } => point.honeyKg !== null)
		.map((point) => ({
			date: formatChartDate(new Date(point.inspectedAt)),
			honeyKg: point.honeyKg,
		}));

	if (data.length === 0) {
		return (
			<div className={EMPTY_CLASS}>
				<p className='text-[14px] text-muted'>Brak danych do wykresu.</p>
				<p className='mt-1 text-[12px] text-subtle'>Wykonaj kilka przeglądów, żeby zobaczyć trend.</p>
			</div>
		);
	}

	if (data.length === 1) {
		return (
			<div className={EMPTY_CLASS}>
				<p className='text-[14px] text-muted'>Potrzeba co najmniej dwóch przeglądów, żeby pokazać trend.</p>
			</div>
		);
	}

	return (
		<div className='chart-wrapper rounded-[10px] border border-border bg-surface p-4'>
			<div className='mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
				<span className='text-[13px] font-medium text-foreground'>Trend miodu (kg)</span>
				{!isPremium && (
					<span className='chart-limit-notice text-[11px] text-muted'>
						Ostatnie 3 miesiące ·{' '}
						<Link
							href='/settings/billing'
							className='text-accent hover:underline'
						>
							Premium
						</Link>{' '}
						odblokuje pełną historię
					</span>
				)}
			</div>

			<div className='h-55'>
				{hydrated ? (
					<ResponsiveContainer
						width='100%'
						height='100%'
					>
						<LineChart
							data={data}
							margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
						>
							<CartesianGrid
								strokeDasharray='3 3'
								stroke='rgba(255,255,255,0.05)'
								vertical={false}
							/>
							<XAxis
								dataKey='date'
								tick={{ fill: 'var(--muted)', fontSize: 11 }}
								axisLine={false}
								tickLine={false}
							/>
							<YAxis
								tick={{ fill: 'var(--muted)', fontSize: 11 }}
								axisLine={false}
								tickLine={false}
								tickFormatter={(value) => `${value} kg`}
								width={48}
							/>
							<Tooltip
								contentStyle={{
									background: 'var(--surface-2)',
									border: '1px solid var(--border-2)',
									borderRadius: '8px',
									fontSize: '12px',
									color: 'var(--foreground)',
								}}
								labelStyle={{ color: 'var(--muted)' }}
								formatter={(value) => [`${Number(value).toFixed(1).replace('.', ',')} kg`, 'Miód']}
							/>
							<Line
								type='monotone'
								dataKey='honeyKg'
								stroke='var(--accent-warm)'
								strokeWidth={2}
								dot={{ fill: 'var(--accent-warm)', r: 4, strokeWidth: 0 }}
								activeDot={{ r: 6, strokeWidth: 0 }}
								connectNulls={false}
								isAnimationActive={false}
							/>
						</LineChart>
					</ResponsiveContainer>
				) : (
					<div className='h-full w-full' />
				)}
			</div>
		</div>
	);
}
