'use client';

import { useEffect, useState } from 'react';

import { DownloadIcon, LoaderIcon } from '@/app/components/dashboard/icons';

interface PdfButtonProps {
	/** The hive's current (last) inspection. `null` when it has never been inspected. */
	inspectionId: string | null;
	disabled?: boolean;
}

// Matches `PrintButton` so the two sit as a pair, plus a disabled treatment
// that keeps the button hoverable (the tooltip has to still work).
const BUTTON_CLASS =
	'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-border-2 bg-surface-2 px-3 text-[13px] font-medium text-muted transition-colors hover:border-border-3 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-2 disabled:hover:text-muted lg:min-h-0 lg:py-1.5 lg:text-[12px]';

const ICON_CLASS =
	'h-4 w-4 shrink-0 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round] lg:h-3.25 lg:w-3.25';

const NOTICE_CLASS = 'max-w-[220px] text-right text-[11px] leading-snug';

// Render's free tier cold-starts; warn the user it may take a moment.
const SLOW_LOAD_MS = 5000;

/**
 * Generates a PDF of the hive's last inspection on demand and hands it to the
 * browser as a download.
 *
 * `fetch`, not a server action: the response is a binary stream, and a server
 * action can only return serializable data. The route replies with a Polish
 * sentence for the failures a user can act on (401 session gone, 429 rate
 * limit or monthly quota, 503 service down); anything else falls back to a
 * generic message.
 */
export function PdfButton({ inspectionId, disabled = false }: PdfButtonProps) {
	const [loading, setLoading] = useState(false);
	const [slowLoad, setSlowLoad] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Only ever flips the notice on; `handleDownload` clears it when a run starts.
	// Resetting it here instead would be a synchronous setState in an effect body.
	useEffect(() => {
		if (!loading) return;
		const timer = setTimeout(() => setSlowLoad(true), SLOW_LOAD_MS);
		return () => clearTimeout(timer);
	}, [loading]);

	async function handleDownload() {
		if (!inspectionId || loading) return;

		setLoading(true);
		setSlowLoad(false);
		setError(null);

		try {
			const response = await fetch(`/api/inspections/${inspectionId}/pdf`, { method: 'POST' });

			if (!response.ok) {
				const body: { error?: string } = await response.json().catch(() => ({}));
				setError(body.error ?? 'Nie udało się wygenerować PDF.');
				return;
			}

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `hivewise-inspekcja-${inspectionId.slice(0, 8)}.pdf`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch (fetchError) {
			console.error('PDF download failed:', fetchError);
			setError('Błąd połączenia. Sprawdź internet i spróbuj ponownie.');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className='flex flex-col items-end gap-1'>
			<button
				type='button'
				onClick={handleDownload}
				disabled={disabled || loading}
				title={disabled ? 'Brak przeglądów do pobrania' : 'Pobierz PDF ostatniego przeglądu'}
				className={BUTTON_CLASS}
			>
				{loading ? (
					<>
						<LoaderIcon className={`${ICON_CLASS} animate-spin`} />
						Generowanie...
					</>
				) : (
					<>
						<DownloadIcon className={ICON_CLASS} />
						Pobierz PDF
					</>
				)}
			</button>
			{slowLoad && <p className={`${NOTICE_CLASS} text-muted`}>Uruchamianie serwisu PDF, to może chwilę potrwać...</p>}
			{error && <p className={`${NOTICE_CLASS} text-danger`}>{error}</p>}
		</div>
	);
}
