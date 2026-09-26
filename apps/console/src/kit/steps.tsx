import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { ChevronRightIcon, BackIcon } from "./icons";

/** Where you are in a few steps (Details · Review · Secret key): done ticked, current ringed. */
export function Stepper(props: {
	steps: readonly string[];
	current: number;
	onStep?: (index: number) => void;
}): JSX.Element {
	return (
		<ol class="flex flex-col gap-0.5">
			<For each={props.steps}>
				{(step, index) => {
					const state = () =>
						index() < props.current ? "done" : index() === props.current ? "current" : "todo";
					return (
						<li>
							<button
								type="button"
								disabled={!props.onStep || index() > props.current}
								onClick={() => props.onStep?.(index())}
								aria-current={state() === "current" ? "step" : undefined}
								class="focus-ring flex h-8 w-full items-center gap-2.5 rounded-kit-md px-2 text-left text-body text-fg-subtle aria-[current=step]:bg-fill-strong aria-[current=step]:text-fg enabled:hover:text-fg"
							>
								<span
									class={`grid size-4 shrink-0 place-items-center rounded-full ${
										state() === "done"
											? "bg-success text-white"
											: state() === "current"
												? "shadow-[inset_0_0_0_4.5px_var(--signal-accent)]"
												: "ring-line-strong"
									}`}
								>
									<Show when={state() === "done"}>
										<svg viewBox="0 0 16 16" class="size-2.5" fill="none" aria-hidden="true">
											<path
												d="M4 8.5l2.5 2.5L12 5.5"
												stroke="currentColor"
												stroke-width="2.5"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									</Show>
								</span>
								{step}
							</button>
						</li>
					);
				}}
			</For>
		</ol>
	);
}

/** Page 1 of 4, with arrows, for long tables. */
export function Pagination(props: {
	page: number;
	pages: number;
	onPage: (page: number) => void;
}): JSX.Element {
	const BUTTON =
		"focus-ring grid size-7 place-items-center rounded-kit text-fg-subtle hover:bg-fill hover:text-fg disabled:pointer-events-none disabled:opacity-35 pointer-coarse:size-10";
	return (
		<nav aria-label="Pages" class="flex items-center gap-1 text-caption text-fg-subtle">
			<span class="mr-auto tabular-nums">
				Page {props.page} of {props.pages}
			</span>
			<button
				type="button"
				aria-label="Previous page"
				disabled={props.page <= 1}
				onClick={() => props.onPage(props.page - 1)}
				class={BUTTON}
			>
				<BackIcon class="size-4" />
			</button>
			<For
				each={Array.from({ length: props.pages }, (_, index) => index + 1).slice(
					Math.max(0, props.page - 3),
					props.page + 2,
				)}
			>
				{(page) => (
					<button
						type="button"
						aria-current={page === props.page ? "page" : undefined}
						onClick={() => props.onPage(page)}
						class="focus-ring grid size-7 place-items-center rounded-kit tabular-nums hover:bg-fill aria-[current=page]:bg-inverse aria-[current=page]:text-inverse-fg pointer-coarse:size-10"
					>
						{page}
					</button>
				)}
			</For>
			<button
				type="button"
				aria-label="Next page"
				disabled={props.page >= props.pages}
				onClick={() => props.onPage(props.page + 1)}
				class={BUTTON}
			>
				<ChevronRightIcon class="size-4" />
			</button>
		</nav>
	);
}
