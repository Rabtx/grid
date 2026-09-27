import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { WorkspaceMark } from "./avatar";
import { UploadIcon } from "./icons";

/** Drop files here, or pick them: a dashed area that lights up while something is dragged over. */
export function DropZone(props: {
	label: string;
	hint?: string;
	accept?: string;
	onFiles: (files: File[]) => void;
}): JSX.Element {
	const [over, setOver] = createSignal(false);
	let input: HTMLInputElement | undefined;
	return (
		<button
			type="button"
			onClick={() => input?.click()}
			onDragOver={(event) => {
				event.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(event) => {
				event.preventDefault();
				setOver(false);
				props.onFiles(Array.from(event.dataTransfer?.files ?? []));
			}}
			class={`focus-ring flex w-full flex-col items-center gap-2 rounded-kit-lg border border-dashed px-6 py-8 text-center transition-colors duration-fast ${over() ? "border-accent bg-accent/5" : "border-line-strong hover:bg-fill"}`}
		>
			<span class="grid size-9 place-items-center rounded-kit-lg bg-fill-strong text-fg-subtle">
				<UploadIcon class="size-4.5" />
			</span>
			<span class="font-medium text-body text-fg">{props.label}</span>
			<Show when={props.hint}>
				<span class="text-caption text-fg-subtle">{props.hint}</span>
			</Show>
			<input
				ref={(el) => {
					input = el;
				}}
				type="file"
				multiple
				accept={props.accept}
				class="hidden"
				onChange={(event) => props.onFiles(Array.from(event.currentTarget.files ?? []))}
			/>
		</button>
	);
}

/** Something that needs you or changed: an icon, what it is, where it came from, when, what to do. */
export function ActivityItem(props: {
	icon: JSX.Element;
	title: string;
	meta: string;
	time: string;
	unread?: boolean;
	actions?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex gap-3 px-4 py-3.5">
			<span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-kit-md bg-fill-strong text-fg-subtle">
				{props.icon}
			</span>
			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<div class="flex items-baseline gap-2">
					<p
						class={`min-w-0 flex-1 text-body ${props.unread ? "font-medium text-fg" : "text-fg-muted"}`}
					>
						{props.title}
					</p>
					<span class="shrink-0 text-caption text-fg-faint">{props.time}</span>
				</div>
				<p class="text-caption text-fg-subtle">{props.meta}</p>
				<Show when={props.actions}>
					<div class="flex flex-wrap gap-2 pt-1.5">{props.actions}</div>
				</Show>
			</div>
			<Show when={props.unread}>
				<span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
			</Show>
		</div>
	);
}

/**
 * Sign-in and onboarding: the form on the left, something to look at on the right (a preview of
 * what is being made). On phones the form alone, full width.
 */
export function SplitLayout(props: { children: JSX.Element; aside?: JSX.Element }): JSX.Element {
	return (
		<div
			class={`w-full md:overflow-hidden md:rounded-kit-xl md:bg-surface md:shadow-page ${props.aside ? "md:grid md:max-w-3xl md:grid-cols-2" : "md:max-w-sm"}`}
		>
			<div class="flex flex-col gap-5 py-2 md:p-8">{props.children}</div>
			<Show when={props.aside}>
				<div class="hidden border-line border-l bg-surface-sunken md:block">{props.aside}</div>
			</Show>
		</div>
	);
}

/**
 * A workspace's sidebar in miniature, drawn from what is typed so far: its mark, name and URL
 * over the navigation it will have. Beside setup and invite forms, it shows what is being made.
 */
export function WorkspacePreview(props: {
	name: string;
	slug: string;
	color?: string | null;
}): JSX.Element {
	const name = () => props.name.trim() || "Your workspace";
	return (
		<div class="flex h-full items-center justify-end py-10 pl-10">
			<div class="flex w-full flex-col gap-4 rounded-l-kit-lg border border-line border-r-0 bg-surface p-4">
				<div class="flex items-center gap-2.5">
					<WorkspaceMark name={name()} color={props.color} size="lg" />
					<div class="min-w-0">
						<p class="truncate font-medium text-body text-fg">{name()}</p>
						<p class="truncate text-caption text-fg-subtle">/{props.slug || "workspace"}</p>
					</div>
				</div>
				<div aria-hidden="true" class="flex flex-col gap-2.5 pt-1">
					{["New chat", "Search", "Terminal"].map((label) => (
						<span class="flex items-center gap-2 text-body text-fg-faint">
							<span class="size-3 rounded-kit-sm bg-fill-strong" />
							{label}
						</span>
					))}
				</div>
				<div aria-hidden="true" class="flex flex-col gap-2.5">
					<span class="text-caption text-fg-faint">Projects</span>
					{["w-24", "w-32", "w-20"].map((width) => (
						<span class="flex items-center gap-2">
							<span class="size-3 rounded-kit-sm bg-fill-strong" />
							<span class={`h-2 rounded-full bg-fill ${width}`} />
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

/**
 * "Add task" at the top of a list: a quiet button that becomes a field. Enter adds and keeps the
 * field for the next; Escape, or leaving it empty, closes it.
 */
export function InlineAdd(props: {
	label: string;
	placeholder?: string;
	onAdd: (value: string) => Promise<void>;
	icon?: JSX.Element;
	maxlength?: number;
}): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const [value, setValue] = createSignal("");
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	async function add(): Promise<void> {
		const text = value().trim();
		if (!text || pending()) return;
		setPending(true);
		setError(null);
		try {
			await props.onAdd(text);
			setValue("");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not add it");
		} finally {
			setPending(false);
		}
	}

	return (
		<div>
			<Show
				when={open()}
				fallback={
					<button
						type="button"
						onClick={() => setOpen(true)}
						class="focus-ring flex h-8 w-full items-center gap-1.5 rounded-kit px-2 text-left text-body text-fg-subtle transition-colors duration-fast hover:bg-fill hover:text-fg-muted pointer-coarse:h-11"
					>
						{props.icon}
						{props.label}
					</button>
				}
			>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void add();
					}}
				>
					<input
						ref={(el) => queueMicrotask(() => el.focus())}
						value={value()}
						onInput={(event) => setValue(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								setValue("");
								setOpen(false);
							}
						}}
						onBlur={() => {
							if (!value().trim()) setOpen(false);
						}}
						aria-label={props.label}
						placeholder={props.placeholder ?? "Title, then Enter"}
						maxlength={props.maxlength ?? 200}
						enterkeyhint="done"
						disabled={pending()}
						class="surface-field h-9 w-full px-2.5 text-field text-fg outline-none placeholder:text-fg-faint"
					/>
				</form>
				<Show when={error()}>
					<p class="mt-1 px-1 text-caption text-danger">{error()}</p>
				</Show>
			</Show>
		</div>
	);
}
