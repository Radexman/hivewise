'use client';

import { PrinterIcon } from '@/app/components/dashboard/icons';

/**
 * Opens the browser print dialog. The clean printed layout is done entirely in
 * CSS — see the `@media print` block in `globals.css` — so this needs no API
 * call and costs nothing.
 *
 * A client component only because `window.print()` is a browser call bound to
 * an `onClick`.
 */
export function PrintButton() {
	return (
		<button
			type='button'
			onClick={() => window.print()}
			className='inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-border-2 bg-surface-2 px-3 text-[13px] font-medium text-muted transition-colors hover:border-border-3 hover:text-foreground lg:min-h-0 lg:py-1.5 lg:text-[12px]'
		>
			<PrinterIcon className='h-4 w-4 shrink-0 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round] lg:h-3.25 lg:w-3.25' />
			Drukuj raport
		</button>
	);
}
