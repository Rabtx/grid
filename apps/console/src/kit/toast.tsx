import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import { CheckCircleIcon, AlertIcon, CloseIcon } from "./icons";

type ToastItem = {
	id: number;
	title: string;
	description?: string;
	tone: "neutral" | "success" | "danger";
	action?: { label: string; run: () => void };
};

const [items, setItems] = createSignal<ToastItem[]>([]);
let next = 1;

/** Say something happened, briefly: saved, copied, failed with a retry. Gone after a few seconds. */
export function notify(toast: Omit<ToastItem, "id" | "tone"> & { tone?: ToastItem["tone"] }): void {
	const id = next++;
	setItems((list) => [...list.slice(-2), { tone: "neutral", ...toast, id }]);
	setTimeout(() => dismiss(id), toast.action ? 6000 : 3500);
}

function dismiss(id: number): void {
	setItems((list) => list.filter((item) => item.id !== id));
}

/** Where toasts appear: bottom centre on phones (above the home bar), bottom right on desktop. */
export function Toasts(): JSX.Element {
	return (
		<ol
			aria-live="polite"
			class="pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 md:inset-x-auto md:right-4 md:bottom-4 md:items-end"
		>
			<For each={items()}>
				{(toast) => (
					<li class="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-kit-lg bg-inverse px-3.5 py-3 text-inverse-fg shadow-float transition-[translate,opacity] duration-base ease-out-grid starting:translate-y-2 starting:opacity-0 md:w-80">
						<Show when={toast.tone !== "neutral"}>
							<span
								class={`mt-px shrink-0 ${toast.tone === "success" ? "text-success" : "text-danger"}`}
							>
								<Show when={toast.tone === "success"} fallback={<AlertIcon class="size-4" />}>
									<CheckCircleIcon class="size-4" />
								</Show>
							</span>
						</Show>
						<div class="min-w-0 flex-1">
							<p class="font-medium text-body">{toast.title}</p>
							<Show when={toast.description}>
								<p class="text-body opacity-70">{toast.description}</p>
							</Show>
						</div>
						<Show when={toast.action}>
							{(action) => (
								<button
									type="button"
									onClick={() => {
										action().run();
										dismiss(toast.id);
									}}
									class="focus-ring shrink-0 rounded-kit-sm px-1.5 font-medium text-body underline-offset-2 hover:underline"
								>
									{action().label}
								</button>
							)}
						</Show>
						<button
							type="button"
							aria-label="Dismiss"
							onClick={() => dismiss(toast.id)}
							class="focus-ring grid size-5 shrink-0 place-items-center rounded-kit-sm opacity-60 hover:opacity-100"
						>
							<CloseIcon class="size-3.5" />
						</button>
					</li>
				)}
			</For>
		</ol>
	);
}
