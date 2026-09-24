import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import { Button } from "./button";
import { CloseIcon } from "./icons";

type ToastTone = "neutral" | "danger";

type ToastAction = {
	label: string;
	onClick: () => void;
};

type ToastInput = {
	message: string;
	action?: ToastAction;
	tone?: ToastTone;
};

type ToastItem = ToastInput & { id: number };

const TOAST_MS = 4_000;

const [items, setItems] = createSignal<ToastItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 0;

function dismiss(id: number): void {
	clearTimeout(timers.get(id));
	timers.delete(id);
	setItems((current) => current.filter((item) => item.id !== id));
}

function schedule(id: number): void {
	timers.set(
		id,
		setTimeout(() => dismiss(id), TOAST_MS),
	);
}

/** Show a short notice at the bottom of the screen; the newest three stay, each for 4 s. */
export function toast(input: ToastInput): void {
	const id = ++nextId;
	setItems((current) => [...current, { ...input, id }].slice(-3));
	schedule(id);
}

/**
 * Where toasts appear: centred above the status bar on phones, bottom-right from md. Hovering or
 * focusing one holds them all until the pointer or focus leaves.
 */
export function Toaster(): JSX.Element {
	let focused = false;

	const pause = () => {
		for (const [id, timer] of timers) {
			clearTimeout(timer);
			timers.delete(id);
		}
	};
	const resume = () => {
		if (focused) return;
		for (const item of items()) if (!timers.has(item.id)) schedule(item.id);
	};

	onSettled(() => () => {
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
	});

	return (
		<div
			class="pointer-events-none fixed right-0 bottom-[calc(2.75rem+env(safe-area-inset-bottom))] left-0 z-50 flex flex-col items-center gap-2 px-4 md:right-4 md:left-auto md:items-end md:px-0"
			onMouseEnter={pause}
			onMouseLeave={resume}
			onFocusIn={() => {
				focused = true;
				pause();
			}}
			onFocusOut={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
					focused = false;
					resume();
				}
			}}
		>
			<output aria-live="polite" class="flex w-full max-w-sm flex-col gap-2">
				<For each={items()}>
					{(item) => (
						<div
							class={`pointer-events-auto flex w-full items-center gap-3 rounded-lg border py-2 pr-1.5 pl-3 shadow-lg ${item.tone === "danger" ? "border-danger/20 bg-danger/10 text-danger" : "border-ink/10 bg-canvas text-ink"}`}
						>
							<span class="min-w-0 flex-1 text-ui-sm">{item.message}</span>
							<Show when={item.action}>
								{(action) => (
									<Button size="sm" onClick={() => action().onClick()}>
										{action().label}
									</Button>
								)}
							</Show>
							<button
								type="button"
								class="focus-ring grid size-7 shrink-0 place-items-center rounded-md text-ink/45 hover:bg-ink/8 hover:text-ink pointer-coarse:size-11"
								aria-label="Dismiss notification"
								onClick={() => dismiss(item.id)}
							>
								<CloseIcon class="size-3.5" />
							</button>
						</div>
					)}
				</For>
			</output>
		</div>
	);
}
