'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { clearDraft } from '../../lib/inspection-draft';

/**
 * Confirmation shown on `/dashboard?inspected=<hiveId>` after a saved
 * inspection. Mounting it is also where the finished draft is cleared —
 * "after the redirect confirms success" is exactly this mount. The `?inspected=`
 * param is stripped only once the toast has gone, so the re-render that the URL
 * change causes cannot cut its lifetime short.
 */
export function InspectionSavedToast({ hiveId, hiveLabel }: { hiveId: string; hiveLabel: string }) {
	const router = useRouter();
	const [open, setOpen] = useState(true);

	useEffect(() => {
		clearDraft(hiveId);
	}, [hiveId]);

	useEffect(() => {
		const timer = setTimeout(() => {
			setOpen(false);
			router.replace('/dashboard', { scroll: false });
		}, 6000);
		return () => clearTimeout(timer);
	}, [router]);

	if (!open) return null;

	return (
		<div
			role='status'
			className='fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-lg border border-accent-dim bg-surface px-4 py-3 text-sm text-foreground shadow-lg lg:bottom-6'
		>
			<span className='text-accent'>✓</span>
			<span>
				Przegląd zapisany dla <span className='font-semibold'>{hiveLabel}</span>
			</span>
			<button
				type='button'
				onClick={() => {
					setOpen(false);
					router.replace('/dashboard', { scroll: false });
				}}
				aria-label='Zamknij'
				className='ml-1 text-muted transition-colors hover:text-foreground'
			>
				✕
			</button>
		</div>
	);
}
