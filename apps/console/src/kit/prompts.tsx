import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import { Button } from "./button";
import { Kbd } from "./badge";

/**
 * An agent asking you to pick: numbered options, arrows or the number keys to choose, Enter to
 * send, Esc to dismiss. The last option can be your own answer.
 */
export function ChoicePrompt(props: {
	question: string;
	options: readonly string[];
	onSubmit: (index: number) => void;
	onDismiss: () => void;
	icon?: JSX.Element;
	/** Take the keyboard as soon as it appears, as a question from a running agent should. */
	autofocus?: boolean;
}): JSX.Element {
	const [active, setActive] = createSignal(0);
	const buttons: HTMLButtonElement[] = [];
	const move = (index: number) => {
		const next = (index + props.options.length) % props.options.length;
		setActive(next);
		buttons[next]?.focus({ preventScroll: true });
	};
	onSettled(() => {
		if (props.autofocus) buttons[0]?.focus({ preventScroll: true });
	});

	// Arrows and number keys move between the options (focus follows); Enter picks, Esc dismisses.
	function onKeyDown(event: KeyboardEvent): void {
		if (event.key === "ArrowDown") move(active() + 1);
		else if (event.key === "ArrowUp") move(active() - 1);
		else if (event.key === "Escape") props.onDismiss();
		else if (/^[1-9]$/.test(event.key) && Number(event.key) <= props.options.length)
			move(Number(event.key) - 1);
		else return;
		event.preventDefault();
	}

	return (
		<fieldset class="flex min-w-0 flex-col gap-1 rounded-kit-2xl border-0 bg-surface p-3 shadow-raise shadow-[0_0_0_1px_var(--kit-line)]">
			<legend class="sr-only">{props.question}</legend>
			<div class="flex items-center gap-2 px-2 pt-1 pb-2" aria-hidden="true">
				<p class="min-w-0 flex-1 text-body-lg text-fg">{props.question}</p>
				{props.icon}
			</div>
			<For each={props.options}>
				{(option, index) => (
					<button
						type="button"
						ref={(el) => {
							buttons[index()] = el;
						}}
						aria-current={active() === index() ? "true" : undefined}
						onKeyDown={onKeyDown}
						onFocus={() => setActive(index())}
						onMouseEnter={() => setActive(index())}
						onClick={() => props.onSubmit(index())}
						class="flex h-10 items-center gap-3 rounded-kit-lg px-2 text-left text-body-lg text-fg-muted outline-none aria-[current=true]:bg-fill-strong aria-[current=true]:text-fg pointer-coarse:h-12"
					>
						<span class="grid size-6 shrink-0 place-items-center rounded-kit-sm text-caption text-fg-subtle shadow-[inset_0_0_0_1px_var(--kit-line-strong)]">
							{index() + 1}
						</span>
						{option}
					</button>
				)}
			</For>
			<div class="flex items-center gap-2 px-2 pt-2">
				<span class="flex items-center gap-1 text-caption text-fg-faint pointer-coarse:hidden">
					<Kbd>↑</Kbd>
					<Kbd>↓</Kbd>
					to navigate
				</span>
				<span class="flex-1" />
				<Button variant="ghost" size="sm" kbd="Esc" onClick={() => props.onDismiss()}>
					Dismiss
				</Button>
				<Button variant="primary" size="sm" kbd="↵" onClick={() => props.onSubmit(active())}>
					Submit
				</Button>
			</div>
		</fieldset>
	);
}

/** A ring that fills with progress, for a checklist's header or a run. */
export function ProgressRing(props: { value: number; size?: number }): JSX.Element {
	const size = () => props.size ?? 18;
	const radius = () => size() / 2 - 2;
	const circumference = () => 2 * Math.PI * radius();
	return (
		<svg
			width={size()}
			height={size()}
			viewBox={`0 0 ${size()} ${size()}`}
			aria-hidden="true"
			class="-rotate-90"
		>
			<circle
				cx={size() / 2}
				cy={size() / 2}
				r={radius()}
				fill="none"
				stroke="var(--kit-fill-strong)"
				stroke-width="2.5"
			/>
			<circle
				cx={size() / 2}
				cy={size() / 2}
				r={radius()}
				fill="none"
				stroke="var(--signal-accent)"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-dasharray={`${circumference()}`}
				stroke-dashoffset={`${circumference() * (1 - Math.max(0.04, Math.min(1, props.value)))}`}
			/>
		</svg>
	);
}

/** Getting started: a few first things to do, ticked off as they happen. */
export function Checklist(props: {
	title: string;
	items: readonly { label: string; done: boolean; onClick?: () => void }[];
}): JSX.Element {
	const done = () => props.items.filter((item) => item.done).length;
	return (
		<div class="flex flex-col gap-1 rounded-kit-lg bg-surface p-3 shadow-[0_0_0_1px_var(--kit-line)]">
			<ProgressRing value={done() / Math.max(1, props.items.length)} size={22} />
			<div class="flex items-baseline justify-between pt-2 pb-1">
				<p class="font-medium text-body-lg text-fg">{props.title}</p>
				<span class="text-caption text-fg-subtle tabular-nums">
					{done()} of {props.items.length}
				</span>
			</div>
			<For each={props.items}>
				{(item) => (
					<button
						type="button"
						onClick={() => item.onClick?.()}
						class="focus-ring flex h-8 items-center gap-2.5 rounded-kit px-1.5 text-left text-body text-fg-muted hover:bg-fill hover:text-fg pointer-coarse:h-11"
					>
						<span
							class={`grid size-4 shrink-0 place-items-center rounded-full ${item.done ? "bg-success text-white" : "shadow-[inset_0_0_0_1.5px_var(--kit-line-strong)]"}`}
						>
							<Show when={item.done}>
								<svg viewBox="0 0 16 16" class="size-3" fill="none" aria-hidden="true">
									<path
										d="M4 8.5l2.5 2.5L12 5.5"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</Show>
						</span>
						<span class={item.done ? "text-fg-subtle line-through" : ""}>{item.label}</span>
					</button>
				)}
			</For>
		</div>
	);
}
