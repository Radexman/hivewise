import type { ReactNode } from 'react';

import type { QueenStatTone } from '@/app/lib/hive-detail';

/**
 * One cell of the 4-up stat grid under the hero. `value` is a node so a card
 * can hold `StrengthDots` as readily as a string, and `tone` tints the value
 * the same way the dashboard tints a queen label.
 */
const VALUE_TONE: Record<QueenStatTone | 'amber' | 'default', string> = {
	ok: 'text-accent',
	warning: 'text-accent-warm',
	danger: 'text-danger',
	muted: 'text-muted',
	amber: 'text-accent-warm',
	default: 'text-foreground',
};

interface StatCardProps {
	label: string;
	value: ReactNode;
	tone?: keyof typeof VALUE_TONE;
}

export function StatCard({ label, value, tone = 'default' }: StatCardProps) {
	return (
		<div className='stat-card flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-3.5'>
			<span className='text-[11px] font-semibold tracking-[0.08em] text-muted uppercase'>{label}</span>
			<span className={`text-[15px] font-medium ${VALUE_TONE[tone]}`}>{value}</span>
		</div>
	);
}
