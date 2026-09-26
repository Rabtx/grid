import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

/**
 * The card signed-out pages sit in: on phones the page itself, edge to edge; from md a raised
 * card on the backdrop, split in two when there is something to show beside the form.
 */
export function AuthCard(props: { children: JSX.Element; aside?: JSX.Element }): JSX.Element {
	return (
		<div
			class={`w-full md:overflow-hidden md:rounded-2xl md:border md:border-ink/8 md:bg-canvas md:shadow-[0_1px_2px_rgb(0_0_0/0.03),0_12px_32px_-16px_rgb(0_0_0/0.12)] ${props.aside ? "md:grid md:max-w-3xl md:grid-cols-[1fr_1fr]" : "md:max-w-md"}`}
		>
			<div class="flex flex-col py-2 md:p-8">{props.children}</div>
			<Show when={props.aside}>
				<div class="hidden border-ink/8 border-l bg-backdrop md:block">{props.aside}</div>
			</Show>
		</div>
	);
}
