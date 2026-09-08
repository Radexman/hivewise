'use client';

import {
	Checkbox,
	createListCollection,
	Field,
	NumberInput,
	Portal,
	RadioGroup,
	RatingGroup,
	Select,
} from '@ark-ui/react';
import { useMemo } from 'react';
import { Controller, useFormContext, type FieldPath } from 'react-hook-form';

import { PrefillNote, usePrefilled } from './prefill';
import type { FormValues } from './schema';

type FieldName = FieldPath<FormValues>;
type Option = { value: string; label: string };

const labelClass = 'text-sm text-muted';
const errorClass = 'text-xs text-danger';
const controlClass =
	'w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-foreground outline-none transition-colors focus:border-accent data-invalid:border-danger';

function useError(name: FieldName): string | undefined {
	const {
		formState: { errors },
	} = useFormContext<FormValues>();
	return (errors as Record<string, { message?: string } | undefined>)[name]?.message;
}

export function TextField({ name, label, placeholder }: { name: FieldName; label: string; placeholder?: string }) {
	const { register } = useFormContext<FormValues>();
	const error = useError(name);
	const prefilled = usePrefilled(name);

	return (
		<Field.Root
			data-field={name}
			data-prefilled={prefilled || undefined}
			invalid={!!error}
			className={`flex flex-col gap-1.5 ${prefilled ? 'opacity-70' : ''}`}
		>
			<Field.Label className={labelClass}>
				{label}
				<PrefillNote name={name} />
			</Field.Label>
			<Field.Input
				className={controlClass}
				placeholder={placeholder}
				{...register(name)}
			/>
			<Field.ErrorText className={errorClass}>{error}</Field.ErrorText>
		</Field.Root>
	);
}

export function TextareaField({
	name,
	label,
	placeholder,
	rows = 4,
}: {
	name: FieldName;
	label: string;
	placeholder?: string;
	rows?: number;
}) {
	const { register } = useFormContext<FormValues>();
	const error = useError(name);
	const prefilled = usePrefilled(name);

	return (
		<Field.Root
			data-field={name}
			data-prefilled={prefilled || undefined}
			invalid={!!error}
			className={`flex flex-col gap-1.5 ${prefilled ? 'opacity-70' : ''}`}
		>
			<Field.Label className={labelClass}>
				{label}
				<PrefillNote name={name} />
			</Field.Label>
			<Field.Textarea
				rows={rows}
				className={`${controlClass} resize-y`}
				placeholder={placeholder}
				{...register(name)}
			/>
			<Field.ErrorText className={errorClass}>{error}</Field.ErrorText>
		</Field.Root>
	);
}

export function NumberField({
	name,
	label,
	placeholder,
	min,
	max,
	onValueChange,
}: {
	name: FieldName;
	label: string;
	placeholder?: string;
	min?: number;
	max?: number;
	/** Fires after the form value settles — for fields that drive other state. */
	onValueChange?: (value: number) => void;
}) {
	const { control } = useFormContext<FormValues>();
	const prefilled = usePrefilled(name);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					data-field={name}
					data-prefilled={prefilled || undefined}
					invalid={!!fieldState.error}
					className={`flex flex-col gap-1.5 ${prefilled ? 'opacity-70' : ''}`}
				>
					<Field.Label className={labelClass}>
						{label}
						<PrefillNote name={name} />
					</Field.Label>
					<NumberInput.Root
						min={min}
						max={max}
						invalid={!!fieldState.error}
						value={field.value === undefined || Number.isNaN(field.value) ? '' : String(field.value)}
						onValueChange={(details) => {
							field.onChange(details.valueAsNumber);
							onValueChange?.(details.valueAsNumber);
						}}
					>
						<NumberInput.Control className='flex items-stretch overflow-hidden rounded-md border border-border bg-surface-2 focus-within:border-accent data-invalid:border-danger'>
							<NumberInput.Input
								className='w-full bg-transparent px-3 py-2 text-foreground outline-none'
								placeholder={placeholder}
								onBlur={field.onBlur}
								ref={field.ref}
							/>
							<div className='flex flex-col border-l border-border'>
								<NumberInput.IncrementTrigger className='flex flex-1 items-center justify-center px-4 text-2xl text-muted hover:bg-surface-3 sm:px-2 sm:text-base'>
									+
								</NumberInput.IncrementTrigger>
								<NumberInput.DecrementTrigger className='flex flex-1 items-center justify-center border-t border-border px-4 text-2xl text-muted hover:bg-surface-3 sm:px-2 sm:text-base'>
									−
								</NumberInput.DecrementTrigger>
							</div>
						</NumberInput.Control>
					</NumberInput.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}

export function SelectField({
	name,
	label,
	options,
	placeholder = 'Wybierz...',
}: {
	name: FieldName;
	label: string;
	options: Option[];
	placeholder?: string;
}) {
	const { control } = useFormContext<FormValues>();
	const collection = useMemo(() => createListCollection({ items: options }), [options]);
	const prefilled = usePrefilled(name);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					data-field={name}
					data-prefilled={prefilled || undefined}
					invalid={!!fieldState.error}
					className={`flex flex-col gap-1.5 ${prefilled ? 'opacity-70' : ''}`}
				>
					<Field.Label className={labelClass}>
						{label}
						<PrefillNote name={name} />
					</Field.Label>
					<Select.Root
						collection={collection}
						invalid={!!fieldState.error}
						value={field.value ? [field.value as string] : []}
						onValueChange={(details) => field.onChange(details.value[0] ?? '')}
						positioning={{ sameWidth: true }}
					>
						<Select.Control>
							<Select.Trigger
								onBlur={field.onBlur}
								className={`${controlClass} flex items-center justify-between gap-2`}
							>
								<Select.ValueText placeholder={placeholder} />
								<Select.Indicator className='text-subtle'>▾</Select.Indicator>
							</Select.Trigger>
						</Select.Control>
						<Portal>
							<Select.Positioner>
								<Select.Content className='z-50 overflow-hidden rounded-md border border-border bg-surface-2 shadow-lg'>
									{options.map((option) => (
										<Select.Item
											key={option.value}
											item={option}
											className='flex cursor-pointer items-center justify-between px-3 py-2 text-foreground data-highlighted:bg-surface-3 data-[state=checked]:text-accent'
										>
											<Select.ItemText>{option.label}</Select.ItemText>
											<Select.ItemIndicator>✓</Select.ItemIndicator>
										</Select.Item>
									))}
								</Select.Content>
							</Select.Positioner>
						</Portal>
					</Select.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}

type GroupedOption = { value: string; label: string; group: string };

export function MultiSelectField({
	name,
	label,
	options,
	placeholder = 'Wybierz...',
}: {
	name: FieldName;
	label: string;
	options: GroupedOption[];
	placeholder?: string;
}) {
	const { control } = useFormContext<FormValues>();
	const collection = useMemo(() => createListCollection({ items: options, groupBy: (item) => item.group }), [options]);
	const prefilled = usePrefilled(name);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => {
				const selected = (field.value as string[] | undefined) ?? [];
				const selectedOptions = options.filter((option) => selected.includes(option.value));

				return (
					<Field.Root
						data-prefilled={prefilled || undefined}
						invalid={!!fieldState.error}
						className={`flex flex-col gap-1.5 ${prefilled ? 'opacity-70' : ''}`}
					>
						<Field.Label className={labelClass}>
							{label}
							<PrefillNote name={name} />
						</Field.Label>
						<Select.Root
							multiple
							collection={collection}
							invalid={!!fieldState.error}
							value={selected}
							onValueChange={(details) => field.onChange(details.value)}
							positioning={{ sameWidth: true }}
						>
							<Select.Control>
								<Select.Trigger
									onBlur={field.onBlur}
									className={`${controlClass} flex items-center justify-between gap-2 text-left`}
								>
									{selectedOptions.length ? (
										<span className='flex flex-wrap gap-1.5'>
											{selectedOptions.map((option) => (
												<span
													key={option.value}
													className='rounded bg-surface-3 px-2 py-0.5 text-xs text-foreground'
												>
													{option.label}
												</span>
											))}
										</span>
									) : (
										<span className='text-subtle'>{placeholder}</span>
									)}
									<Select.Indicator className='shrink-0 text-subtle'>▾</Select.Indicator>
								</Select.Trigger>
							</Select.Control>
							<Portal>
								<Select.Positioner>
									<Select.Content className='z-50 max-h-72 overflow-y-auto rounded-md border border-border bg-surface-2 shadow-lg'>
										{collection.group().map(([group, items]) => (
											<Select.ItemGroup key={group}>
												<Select.ItemGroupLabel className='px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-subtle'>
													{group}
												</Select.ItemGroupLabel>
												{items.map((option) => (
													<Select.Item
														key={option.value}
														item={option}
														className='flex cursor-pointer items-center justify-between px-3 py-2 text-foreground data-highlighted:bg-surface-3 data-[state=checked]:text-accent'
													>
														<Select.ItemText>{option.label}</Select.ItemText>
														<Select.ItemIndicator>✓</Select.ItemIndicator>
													</Select.Item>
												))}
											</Select.ItemGroup>
										))}
									</Select.Content>
								</Select.Positioner>
							</Portal>
						</Select.Root>
						<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
					</Field.Root>
				);
			}}
		/>
	);
}

export function RadioField({
	name,
	label,
	options,
	columns = 2,
}: {
	name: FieldName;
	label: string;
	options: Option[];
	columns?: 1 | 2;
}) {
	const { control } = useFormContext<FormValues>();
	const prefilled = usePrefilled(name);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					data-field={name}
					data-prefilled={prefilled || undefined}
					invalid={!!fieldState.error}
					className={`flex flex-col gap-2 ${prefilled ? 'opacity-70' : ''}`}
				>
					<Field.Label className={labelClass}>
						{label}
						<PrefillNote name={name} />
					</Field.Label>
					<RadioGroup.Root
						value={(field.value as string | undefined) ?? null}
						onValueChange={(details) => field.onChange(details.value)}
						onBlur={field.onBlur}
						invalid={!!fieldState.error}
						className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
					>
						{options.map((option) => (
							<RadioGroup.Item
								key={option.value}
								value={option.value}
								className='flex min-h-14 cursor-pointer items-center rounded-lg border border-border bg-surface-2 px-4 py-3 text-foreground transition-colors hover:border-subtle data-[state=checked]:border-accent data-[state=checked]:bg-accent/10 data-[state=checked]:ring-1 data-[state=checked]:ring-accent data-invalid:data-[state=checked]:border-danger'
							>
								<RadioGroup.ItemText className='text-sm font-medium'>{option.label}</RadioGroup.ItemText>
								<RadioGroup.ItemHiddenInput />
							</RadioGroup.Item>
						))}
					</RadioGroup.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}

const SWATCH_COLORS: Record<string, string> = {
	white: '#ffffff',
	yellow: '#fde047',
	red: '#fca5a5',
	green: '#6ee7b7',
	blue: '#67e8f9',
};

export function SwatchField({ name, label, options }: { name: FieldName; label: string; options: Option[] }) {
	const { control } = useFormContext<FormValues>();
	const prefilled = usePrefilled(name);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					data-field={name}
					data-prefilled={prefilled || undefined}
					invalid={!!fieldState.error}
					className={`flex flex-col gap-2 ${prefilled ? 'opacity-70' : ''}`}
				>
					<Field.Label className={labelClass}>
						{label}
						<PrefillNote name={name} />
					</Field.Label>
					<RadioGroup.Root
						value={(field.value as string | undefined) ?? null}
						onValueChange={(details) => field.onChange(details.value)}
						onBlur={field.onBlur}
						invalid={!!fieldState.error}
						className='flex flex-wrap gap-3'
					>
						{options.map((option) => (
							<RadioGroup.Item
								key={option.value}
								value={option.value}
								title={option.label}
								aria-label={option.label}
								className='group flex h-12 w-12 cursor-pointer items-center justify-center rounded-full ring-2 ring-border ring-offset-2 ring-offset-surface transition-all hover:ring-subtle data-[state=checked]:ring-accent'
								style={{ backgroundColor: SWATCH_COLORS[option.value] ?? 'transparent' }}
							>
								<span className='hidden text-base font-bold text-background group-data-[state=checked]:block'>✓</span>
								<RadioGroup.ItemHiddenInput />
							</RadioGroup.Item>
						))}
					</RadioGroup.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}

export function CheckboxField({ name, label }: { name: FieldName; label: string }) {
	const { control } = useFormContext<FormValues>();
	const prefilled = usePrefilled(name);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					data-field={name}
					data-prefilled={prefilled || undefined}
					invalid={!!fieldState.error}
					className={`flex flex-col gap-1.5 ${prefilled ? 'opacity-70' : ''}`}
				>
					<Checkbox.Root
						checked={!!field.value}
						onCheckedChange={(details) => field.onChange(details.checked === true)}
						invalid={!!fieldState.error}
						className='flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 transition-colors hover:border-subtle data-[state=checked]:border-accent data-[state=checked]:bg-accent/10 data-invalid:border-danger'
					>
						<Checkbox.Control className='flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-surface text-background data-[state=checked]:border-accent data-[state=checked]:bg-accent'>
							<Checkbox.Indicator>✓</Checkbox.Indicator>
						</Checkbox.Control>
						<Checkbox.Label className='text-sm font-medium text-foreground'>
							{label}
							<PrefillNote name={name} />
						</Checkbox.Label>
						<Checkbox.HiddenInput onBlur={field.onBlur} />
					</Checkbox.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}

export function CheckboxGroupField({ name, label, options }: { name: FieldName; label: string; options: Option[] }) {
	const { control } = useFormContext<FormValues>();
	const prefilled = usePrefilled(name);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<div
					data-prefilled={prefilled || undefined}
					className={`flex flex-col gap-2 ${prefilled ? 'opacity-70' : ''}`}
				>
					<span className={labelClass}>
						{label}
						<PrefillNote name={name} />
					</span>
					<Checkbox.Group
						value={(field.value as unknown as string[]) ?? []}
						onValueChange={field.onChange}
						onBlur={field.onBlur}
						invalid={!!fieldState.error}
						className='flex flex-col gap-2'
					>
						{options.map((option) => (
							<Checkbox.Root
								key={option.value}
								value={option.value}
								className='flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 transition-colors hover:border-subtle data-[state=checked]:border-accent data-[state=checked]:bg-accent/10 data-invalid:border-danger'
							>
								<Checkbox.Control className='flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-surface text-background data-[state=checked]:border-accent data-[state=checked]:bg-accent'>
									<Checkbox.Indicator>✓</Checkbox.Indicator>
								</Checkbox.Control>
								<Checkbox.Label className='text-sm font-medium text-foreground'>{option.label}</Checkbox.Label>
								<Checkbox.HiddenInput />
							</Checkbox.Root>
						))}
					</Checkbox.Group>
					{fieldState.error && <span className={errorClass}>{fieldState.error.message}</span>}
				</div>
			)}
		/>
	);
}

export function RatingField({ name, label, count = 5 }: { name: FieldName; label: string; count?: number }) {
	const { control } = useFormContext<FormValues>();
	const prefilled = usePrefilled(name);

	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field.Root
					data-field={name}
					data-prefilled={prefilled || undefined}
					invalid={!!fieldState.error}
					className={`flex flex-col gap-1.5 ${prefilled ? 'opacity-70' : ''}`}
				>
					<Field.Label className={labelClass}>
						{label}
						<PrefillNote name={name} />
					</Field.Label>
					<RatingGroup.Root
						count={count}
						value={(field.value as number) ?? 0}
						onValueChange={(details) => field.onChange(details.value)}
						className='flex items-center gap-3'
					>
						<RatingGroup.Control className='flex gap-2'>
							<RatingGroup.Context>
								{(api) =>
									api.items.map((value) => (
										<RatingGroup.Item
											key={value}
											index={value}
											className='cursor-pointer'
										>
											<RatingGroup.ItemContext>
												{(item) => (
													<span
														className={`flex h-12 w-12 items-center justify-center rounded-full border font-mono text-base transition-colors ${
															item.checked
																? 'border-accent bg-accent/10 text-foreground ring-1 ring-accent'
																: item.highlighted
																	? 'border-accent/60 bg-accent/5 text-foreground'
																	: 'border-border bg-surface-2 text-muted'
														}`}
													>
														{value}
													</span>
												)}
											</RatingGroup.ItemContext>
										</RatingGroup.Item>
									))
								}
							</RatingGroup.Context>
						</RatingGroup.Control>
						<RatingGroup.HiddenInput onBlur={field.onBlur} />
					</RatingGroup.Root>
					<Field.ErrorText className={errorClass}>{fieldState.error?.message}</Field.ErrorText>
				</Field.Root>
			)}
		/>
	);
}
