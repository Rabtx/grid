import type { JSX } from "@solidjs/web";
import { createEffect, For, Show } from "solid-js";

import { Dialog } from "./dialog";

/** One thing a split can show: a tool (a tile) or an item from a list, such as a changed file. */
export type SplitChoice = {
	id: string;
	label: string;
	detail?: string;
	icon: JSX.Element;
	/** `tool` shows as a large tile; `item` as a compact row under its group's heading. */
	kind: "tool" | "item";
	/** The heading the item rows sit under: "Changed files". */
	group?: string;
	/** It is open already: picking it brings it forward. */
	open?: boolean;
};

/**
 * What to open beside a thread, asked in one place (after the window switcher in the video the
 * split is modelled on): the tools as large tiles first, then any lists (changed files) as rows.
 * Arrow keys move between them, Enter picks, Escape closes. A sheet on phones.
 */
export function SplitChooser(props: {
	open: boolean;
	title: string;
	description?: string;
	choices: readonly SplitChoice[];
	onPick: (id: string) => void;
	onClose: () => void;
}): JSX.Element {
	let body: HTMLDivElement | undefined;
	const tools = () => props.choices.filter((choice) => choice.kind === "tool");
	const groups = () => {
		const names: string[] = [];
		for (const choice of props.choices)
			if (choice.kind === "item" && choice.group && !names.includes(choice.group))
				names.push(choice.group);
		return names.map((name) => ({
			name,
			items: props.choices.filter((choice) => choice.kind === "item" && choice.group === name),
		}));
	};

	// The first choice takes the focus as it opens, so Enter alone opens the usual pick.
	createEffect(
		() => props.open,
		(open) => {
			if (!open) return;
			requestAnimationFrame(() => body?.querySelector<HTMLElement>("[data-choice]")?.focus());
		},
	);

	function move(event: KeyboardEvent): void {
		const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
		if (!step || !body) return;
		const all = [...body.querySelectorAll<HTMLElement>("[data-choice]")];
		const at = all.indexOf(document.activeElement as HTMLElement);
		const next = all[(at + step + all.length) % all.length];
		if (!next) return;
		event.preventDefault();
		next.focus();
	}

	const pick = (id: string) => {
		props.onPick(id);
		props.onClose();
	};

	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title={props.title}
			description={props.description}
			width="38rem"
		>
			{/* Arrow keys walk the choices; each is a button, so Tab and Enter work as usual too. */}
			{/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
			<div
				ref={(el) => {
					body = el;
				}}
				onKeyDown={move}
				class="flex flex-col gap-5 pb-2"
			>
				<Show when={tools().length}>
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<For each={tools()}>
							{(choice) => (
								<button
									type="button"
									data-choice
									onClick={() => pick(choice.id)}
									class="focus-ring group flex min-w-0 flex-col items-start gap-3 rounded-kit-lg bg-fill p-3 text-left transition-[background-color,scale] duration-fast ease-out-grid hover:bg-fill-strong active:scale-[0.98]"
								>
									<span class="grid size-10 place-items-center rounded-control-lg bg-surface text-fg shadow-knob [&_svg]:size-5">
										{choice.icon}
									</span>
									<span class="flex min-w-0 flex-col">
										<span class="truncate font-medium text-body text-fg">{choice.label}</span>
										<span class="truncate text-caption text-fg-subtle">
											{choice.open ? "Open · bring forward" : (choice.detail ?? "")}
										</span>
									</span>
								</button>
							)}
						</For>
					</div>
				</Show>
				<For each={groups()}>
					{(group) => (
						<section class="flex flex-col gap-1">
							<h3 class="px-1 text-caption text-fg-subtle">{group.name}</h3>
							<For each={group.items}>
								{(choice) => (
									<button
										type="button"
										data-choice
										onClick={() => pick(choice.id)}
										class="focus-ring flex h-10 min-w-0 items-center gap-3 rounded-control px-2 text-left transition-colors duration-fast hover:bg-fill pointer-coarse:h-12 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle"
									>
										{choice.icon}
										<span class="min-w-0 truncate text-body text-fg">{choice.label}</span>
										<Show when={choice.detail}>
											<span class="ml-auto min-w-0 truncate text-caption text-fg-subtle">
												{choice.detail}
											</span>
										</Show>
									</button>
								)}
							</For>
						</section>
					)}
				</For>
			</div>
		</Dialog>
	);
}
