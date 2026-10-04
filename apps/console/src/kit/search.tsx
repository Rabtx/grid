import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Kbd } from "./badge";
import { SearchIcon } from "./icons";

/*
 * Figma 25 · Search & Ask: the field across the top, results in groups (threads, files, tasks,
 * commands), the keys along the bottom; and Ask Grid's answer, every claim pointing at a source.
 */

/** Search's frame inside its dialog: never taller than the screen allows. */
export function SearchPanel(props: { children: JSX.Element }): JSX.Element {
	return <div class="flex max-h-[min(42rem,80dvh)] flex-col">{props.children}</div>;
}

/** The field: what to look for, and whether Enter searches or asks. */
export function SearchField(props: {
	value: string;
	onInput: (value: string) => void;
	onKeyDown: (event: KeyboardEvent) => void;
	placeholder: string;
	/** Asking: the field shows an Ask badge instead of Esc. */
	asking: boolean;
	label: string;
}): JSX.Element {
	return (
		<div class="flex h-13 shrink-0 items-center gap-2.5 border-line border-b px-4">
			<SearchIcon class="size-4 shrink-0 text-fg-subtle" />
			<input
				ref={(el) => queueMicrotask(() => el.focus())}
				type="search"
				aria-label={props.label}
				autocomplete="off"
				spellcheck={false}
				placeholder={props.placeholder}
				value={props.value}
				onInput={(event) => props.onInput(event.currentTarget.value)}
				onKeyDown={(event) => props.onKeyDown(event)}
				class="min-w-0 flex-1 bg-transparent text-body-lg text-fg outline-none placeholder:text-fg-faint"
			/>
			<Show when={props.asking} fallback={<Kbd>esc</Kbd>}>
				<span class="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-caption text-accent">
					Ask
				</span>
			</Show>
		</div>
	);
}

/** A run of results under its name. */
export function ResultGroup(props: { label: string; children: JSX.Element }): JSX.Element {
	return (
		<section aria-label={props.label} class="flex flex-col">
			<h3 class="px-2.5 pt-2.5 pb-1.5 font-normal text-caption text-fg-subtle">{props.label}</h3>
			{props.children}
		</section>
	);
}

/** One result: its tile, name and where it is; the highlighted one shows ↵ or its keys. */
export function ResultRow(props: {
	icon: JSX.Element;
	label: string;
	hint?: string;
	keys?: string;
	active: boolean;
	onHover: () => void;
	onPick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			aria-current={props.active ? "true" : undefined}
			onMouseMove={() => props.onHover()}
			onClick={() => props.onPick()}
			class="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-kit-md px-2.5 text-left transition-colors duration-fast aria-[current=true]:bg-accent/8 pointer-coarse:min-h-12"
		>
			<span class="grid size-7 shrink-0 place-items-center rounded-kit text-fg-muted [&_svg]:size-4">
				{props.icon}
			</span>
			<span class="min-w-0 truncate text-body text-fg">{props.label}</span>
			<Show when={props.hint}>
				<span class="min-w-0 truncate text-caption text-fg-subtle">{props.hint}</span>
			</Show>
			<span class="flex-1" />
			<Show when={props.keys || props.active}>
				<Kbd>{props.keys ?? "↵"}</Kbd>
			</Show>
		</button>
	);
}

/** The strip along the bottom: keys and what they do on the left, a note on the right. */
export function SearchFooter(props: { keys: JSX.Element; note?: JSX.Element }): JSX.Element {
	return (
		<div class="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-line border-t bg-surface-sunken px-4 py-2 text-caption text-fg-subtle">
			<span class="flex items-center gap-2 pointer-coarse:hidden">{props.keys}</span>
			<span class="flex-1" />
			{props.note}
		</div>
	);
}

/** A key and what it does, for the footer. */
export function KeyHint(props: { keys: string; children: JSX.Element }): JSX.Element {
	return (
		<span class="inline-flex items-center gap-1.5">
			<Kbd>{props.keys}</Kbd>
			{props.children}
		</span>
	);
}

/** A citation: its number on a small blue tile. */
export function Citation(props: { n: number }): JSX.Element {
	return (
		<span class="mx-0.5 inline-grid h-4.5 min-w-4.5 place-items-center rounded-kit-xs bg-accent/10 px-1 align-middle text-micro text-accent tabular-nums">
			{props.n}
		</span>
	);
}

/** Text with its `[n]` citations drawn as tiles, paragraph by paragraph. */
export function CitedText(props: { text: string }): JSX.Element {
	const paragraphs = () => props.text.split(/\n{2,}/).filter((part) => part.trim());
	return (
		<div class="flex flex-col gap-3 text-body text-fg">
			<For each={paragraphs()}>
				{(paragraph, index) => (
					<p class={index() === 0 ? "text-body-lg" : "leading-relaxed"}>
						<For each={paragraph.split(/(\[\d+\])/)}>
							{(part) => {
								const cited = /^\[(\d+)\]$/.exec(part);
								return cited ? <Citation n={Number(cited[1])} /> : <>{part}</>;
							}}
						</For>
					</p>
				)}
			</For>
		</div>
	);
}

/** One source an answer drew on: its number, its kind's tile, its title and what it is. */
export function SourceRow(props: {
	n: number;
	icon: JSX.Element;
	title: string;
	meta: string;
	onOpen?: () => void;
}): JSX.Element {
	const body = (
		<>
			<Citation n={props.n} />
			<span class="grid size-7 shrink-0 place-items-center rounded-full bg-fill text-fg-muted [&_svg]:size-3.5">
				{props.icon}
			</span>
			<span class="flex min-w-0 flex-col">
				<span class="truncate text-body text-fg">{props.title}</span>
				<span class="truncate text-caption text-fg-subtle">{props.meta}</span>
			</span>
		</>
	);
	return (
		<Show
			when={props.onOpen}
			fallback={<div class="flex min-h-14 items-center gap-3 px-3.5 py-2">{body}</div>}
		>
			<button
				type="button"
				onClick={() => props.onOpen?.()}
				class="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left transition-colors duration-fast hover:bg-fill/60"
			>
				{body}
			</button>
		</Show>
	);
}

/** The sources, one card of rows. */
export function SourceList(props: { children: JSX.Element }): JSX.Element {
	return <div class="divide-y divide-line rounded-kit-lg ring-line">{props.children}</div>;
}

/** Questions to ask next, as chips. */
export function FollowUps(props: {
	items: readonly string[];
	onPick: (question: string) => void;
}): JSX.Element {
	return (
		<div class="flex flex-wrap gap-2">
			<For each={props.items}>
				{(item) => (
					<button
						type="button"
						onClick={() => props.onPick(item)}
						class="surface-outline focus-ring rounded-full px-3 py-1.5 text-caption text-fg-muted transition-colors duration-fast hover:text-fg"
					>
						{item}
					</button>
				)}
			</For>
		</div>
	);
}
