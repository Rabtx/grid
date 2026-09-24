import type { JSX } from "@solidjs/web";
import { createSignal, For, onCleanup } from "solid-js";

import { Button } from "./button";

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

const [items, setItems] = createSignal<ToastItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 0;

function dismiss(id: number): void {
	const timer = timers.get(id);
	if (timer) clearTimeout(timer);
	timers.delete(id);
	setItems((current) => current.filter((item) => item.id !== id));
}

export function toast(input: ToastInput): void {
	const id = ++nextId;
	setItems((current) => [...current, { ...input, id }].slice(-3));
	const timer = setTimeout(() => dismiss(id), 4_000);
	timers.set(id, timer);
}

export function Toaster(): JSX.Element {
	let focused = false;

	const pause = () => {
		for (const id of items().map((item) => item.id)) {
			const timer = timers.get(id);
			if (timer) clearTimeout(timer);
		}
	};
	const resume = () => {
		if (focused) return;
		for (const item of items()) {
			if (!timers.has(item.id))
				timers.set(
					item.id,
					setTimeout(() => dismiss(item.id), 4_000),
				);
		}
	};
	onCleanup(() => {
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
	});

	return (
		<div
			class="pointer-events-none fixed right-0 bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 z-50 flex flex-col items-center gap-2 px-4 md:right-4 md:left-auto md:items-end md:px-0"
			onMouseEnter={pause}
			onMouseLeave={resume}
			onFocusIn={pause}
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
							class={`pointer-events-auto flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 shadow-lg ${item.tone === "danger" ? "border-danger/20 bg-danger/10 text-danger" : "border-ink/10 bg-canvas text-ink"}`}
							onFocusIn={() => (focused = true)}
						>
							<span class="min-w-0 flex-1 text-ui-sm">{item.message}</span>
							{item.action && (
								<Button size="sm" onClick={item.action.onClick}>
									{item.action.label}
								</Button>
							)}
							<button
								type="button"
								class="focus-ring min-h-11 min-w-11 rounded-md text-ink/45 hover:bg-ink/8 hover:text-ink"
								aria-label="Dismiss notification"
								onClick={() => dismiss(item.id)}
							>
								×
							</button>
						</div>
					)}
				</For>
			</output>
		</div>
	);
}
