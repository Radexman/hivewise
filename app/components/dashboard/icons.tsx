/**
 * Inline SVGs traced from `context/templates/dashboard.html`. Every icon draws
 * with `stroke: currentColor` and no fill, so colour comes from the parent's
 * text colour and nothing here needs to know about the token set.
 */

/** Honeycomb cell in the sidebar logo tile. Pointy-top, drawn to a 14×14 box. */
export function HexIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 14 14'
			aria-hidden='true'
			className={className}
		>
			<polygon points='7,1 1.8,4 1.8,10 7,13 12.2,10 12.2,4' />
		</svg>
	);
}

export function GridIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<rect
				x='3'
				y='3'
				width='7'
				height='7'
				rx='1'
			/>
			<rect
				x='14'
				y='3'
				width='7'
				height='7'
				rx='1'
			/>
			<rect
				x='3'
				y='14'
				width='7'
				height='7'
				rx='1'
			/>
			<rect
				x='14'
				y='14'
				width='7'
				height='7'
				rx='1'
			/>
		</svg>
	);
}

export function ChartIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
		</svg>
	);
}

export function UserIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<circle
				cx='12'
				cy='8'
				r='4'
			/>
			<path d='M4 20c0-4 3.6-7 8-7s8 3 8 7' />
		</svg>
	);
}

export function PlusIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<line
				x1='12'
				y1='5'
				x2='12'
				y2='19'
			/>
			<line
				x1='5'
				y1='12'
				x2='19'
				y2='12'
			/>
		</svg>
	);
}

/** Door with an arrow leaving it — the sidebar's sign-out control. */
export function SignOutIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<path d='M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4' />
			<polyline points='16,8 20,12 16,16' />
			<line
				x1='20'
				y1='12'
				x2='10'
				y2='12'
			/>
		</svg>
	);
}

/** Left chevron — the "back to dashboard" link in the hive detail topbar. */
export function ChevronLeftIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<polyline points='15 18 9 12 15 6' />
		</svg>
	);
}

/** Printer — the "Drukuj raport" button on the hive detail page. */
export function PrinterIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<polyline points='6 9 6 2 18 2 18 9' />
			<path d='M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' />
			<rect
				x='6'
				y='14'
				width='12'
				height='8'
				rx='1'
			/>
		</svg>
	);
}

/** Envelope — the email-verification pages. */
export function MailIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<rect
				x='3'
				y='5'
				width='18'
				height='14'
				rx='2'
			/>
			<polyline points='3,7 12,13 21,7' />
		</svg>
	);
}

export function EyeIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<path d='M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z' />
			<circle
				cx='12'
				cy='12'
				r='3'
			/>
		</svg>
	);
}

export function EyeOffIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<path d='M10.6 6.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.2M6.5 7.4A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.1-.9' />
			<path d='M9.9 9.9a3 3 0 0 0 4.2 4.2' />
			<line
				x1='3'
				y1='3'
				x2='21'
				y2='21'
			/>
		</svg>
	);
}

/** Lidded bin — the delete-account control in the danger zone. */
export function TrashIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<polyline points='4,7 20,7' />
			<path d='M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' />
			<path d='M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7' />
			<line
				x1='10'
				y1='11'
				x2='10'
				y2='17'
			/>
			<line
				x1='14'
				y1='11'
				x2='14'
				y2='17'
			/>
		</svg>
	);
}

/** Padlock — heads the password section. */
export function LockIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<rect
				x='4'
				y='10'
				width='16'
				height='11'
				rx='2'
			/>
			<path d='M8 10V7a4 4 0 0 1 8 0v3' />
		</svg>
	);
}

/** Exclamation in a triangle — warnings that are not yet failures. */
export function WarningIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<path d='M12 4 2.5 20h19L12 4Z' />
			<line
				x1='12'
				y1='10'
				x2='12'
				y2='14'
			/>
			<line
				x1='12'
				y1='17'
				x2='12'
				y2='17'
			/>
		</svg>
	);
}

/** Tray with a downward arrow — the "Pobierz PDF" button on the hive detail page. */
export function DownloadIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
			<polyline points='7 10 12 15 17 10' />
			<line
				x1='12'
				y1='15'
				x2='12'
				y2='3'
			/>
		</svg>
	);
}

/** Broken ring — paired with `animate-spin` for in-flight actions. */
export function LoaderIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<path d='M21 12a9 9 0 1 1-6.219-8.56' />
		</svg>
	);
}
