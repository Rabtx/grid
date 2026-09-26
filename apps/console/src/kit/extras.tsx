import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { UploadIcon } from "../ui/icons";

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
			class={`w-full md:overflow-hidden md:rounded-kit-xl md:bg-surface md:shadow-[0_0_0_1px_var(--kit-line),0_16px_40px_-20px_rgb(0_0_0/0.15)] ${props.aside ? "md:grid md:max-w-3xl md:grid-cols-2" : "md:max-w-sm"}`}
		>
			<div class="flex flex-col gap-5 py-2 md:p-8">{props.children}</div>
			<Show when={props.aside}>
				<div class="hidden border-line border-l bg-surface-sunken md:block">{props.aside}</div>
			</Show>
		</div>
	);
}
