import CompassIcon from "@hugeicons/core-free-icons/CompassIcon";
import LockKeyholeIcon from "@hugeicons/core-free-icons/LockKeyholeIcon";
import LockKeyholeOpenIcon from "@hugeicons/core-free-icons/LockKeyholeOpenIcon";
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
	BackIcon,
	CheckIcon,
	ChevronDownIcon,
	Icon,
	type IconData,
	Popover,
	SearchIcon,
} from "@/ui";

import {
	filterChoices,
	findChoice,
	groupChoices,
	modeDescription,
	modeGlyph,
	type ModeGlyph,
} from "../lib/choices";
import type { ChatProvider, Choice } from "../types/chat.types";

import { ProviderMark } from "./session-list";

/** The chips on the composer's toolbar: the model and the mode, 26px, 44px for a thumb. */
const CHIP =
	"focus-ring inline-flex h-[26px] min-w-0 max-w-[15rem] shrink items-center gap-1.5 rounded-md bg-selection px-2 text-ui-xs transition-colors duration-fast ease-out-grid hover:bg-selection-hover aria-expanded:bg-selection-strong disabled:opacity-40 pointer-coarse:h-11";

/** A row in a picker panel: 36px, 44px for a thumb. The tone is added by each row. */
const ROW =
	"focus-ring flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-ui transition-colors duration-fast ease-out-grid pointer-coarse:h-11";

/** What you have is on the selection, what the keyboard is on lights up, the rest on hover. */
function rowTone(selected: boolean, active = false): string {
	if (selected) return "bg-selection";
	return active ? "bg-ink/8" : "hover:bg-ink/8";
}

/**
 * The shared popover draws one panel width for every picker. Each picker takes the width the
 * reference gives it from `md` up, over that panel; the phone sheet stays full width.
 */
const PANEL_WIDTH = {
	model: "md:[&_[popover]:has(.picker-model)]:w-[15.5rem]",
	mode: "md:[&_[popover]:has(.picker-mode)]:w-[17.875rem]",
} as const;

const MODE_ICONS: Record<ModeGlyph, IconData> = {
	lock: LockKeyholeIcon,
	edit: PencilEdit01Icon,
	plan: CompassIcon,
	open: LockKeyholeOpenIcon,
};

/** The tile beside a model's name: the provider it belongs to, else the agent offering it. */
function modelMark(models: readonly Choice[], id: string, agent?: string): string {
	return findChoice(models, id)?.group || agent || id || "model";
}

/** A row of mutually exclusive chips inside a picker: the agent the models come from. */
function ChipRow(props: {
	label: string;
	choices: readonly Choice[];
	value: string | null;
	onChange: (id: string) => void;
}): JSX.Element {
	return (
		<fieldset class="flex min-w-0 flex-col gap-1.5 border-0 px-3 pt-2.5">
			<legend class="float-left mb-1.5 text-ink/45 text-ui-caption uppercase tracking-wide">
				{props.label}
			</legend>
			<div class="clear-both flex flex-wrap gap-1.5">
				<For each={props.choices}>
					{(choice) => (
						<button
							type="button"
							aria-pressed={props.value === choice.id ? "true" : "false"}
							onClick={() => props.onChange(choice.id)}
							class="focus-ring shrink-0 rounded-md border border-ink/10 px-2.5 py-1 text-ink/70 text-ui-xs transition-colors duration-fast ease-out-grid hover:bg-ink/6 aria-pressed:border-ink/30 aria-pressed:bg-ink aria-pressed:text-canvas pointer-coarse:py-2"
						>
							{choice.name}
						</button>
					)}
				</For>
			</div>
		</fieldset>
	);
}

/** One panel row: its label on the left, the value and a chevron on the right. */
function LinkRow(props: {
	label: string;
	onClick: () => void;
	children?: JSX.Element;
}): JSX.Element {
	return (
		<button type="button" onClick={props.onClick} class={ROW}>
			<span class="text-ink">{props.label}</span>
			<span class="ml-auto flex min-w-0 items-center gap-1.5 text-ink/55">{props.children}</span>
			<ChevronDownIcon class="size-3 shrink-0 -rotate-90 text-ink/40" />
		</button>
	);
}

/** The way back to the panel's first view, named after the view you left. */
function BackRow(props: { label: string; onClick: () => void }): JSX.Element {
	return (
		<button type="button" onClick={props.onClick} class={ROW}>
			<BackIcon class="size-4 shrink-0 text-ink/45" />
			<span class="text-ink">{props.label}</span>
		</button>
	);
}

/**
 * The model chip and its panel: how hard the model thinks, and a searchable list of the agent's
 * models grouped by the provider each belongs to — switching the agent lives in that list. A
 * bottom sheet on phones, a panel above the chip on desktop; never the platform's own picker.
 */
export function ModelPicker(props: {
	agents?: readonly ChatProvider[];
	agent?: string;
	onAgent?: (id: string) => void;
	models: readonly Choice[];
	model: string;
	onModel: (id: string) => void;
	efforts: readonly Choice[];
	effort: string | null;
	onEffort: (id: string) => void;
	disabled?: boolean;
}): JSX.Element {
	const model = () => findChoice(props.models, props.model);
	const effort = () => findChoice(props.efforts, props.effort);
	const name = () => model()?.name || props.model || "Model";

	return (
		<span class={`contents ${PANEL_WIDTH.model}`}>
			<Popover
				label="Model"
				disabled={props.disabled}
				triggerClass={CHIP}
				trigger={
					<>
						<ProviderMark
							provider={modelMark(props.models, props.model, props.agent)}
							class="size-4"
						/>
						<span class="truncate text-ink">{name()}</span>
						<Show when={effort()}>
							{(level) => <span class="shrink-0 text-ink/50">{level().name}</span>}
						</Show>
						<ChevronDownIcon class="size-3 shrink-0 text-ink/40" />
					</>
				}
			>
				{(close) => <ModelPanel {...props} close={close} />}
			</Popover>
		</span>
	);
}

type ModelView = "root" | "effort" | "models";

function ModelPanel(props: Parameters<typeof ModelPicker>[0] & { close: () => void }): JSX.Element {
	const [view, setView] = createSignal<ModelView>("root");
	const [query, setQuery] = createSignal("");
	const [active, setActive] = createSignal(0);
	const shown = createMemo(() => filterChoices(props.models, query()));
	const groups = createMemo(() => groupChoices(shown()));
	const effort = () => findChoice(props.efforts, props.effort);
	const model = () => findChoice(props.models, props.model);
	let list: HTMLDivElement | undefined;

	function choose(model: Choice): void {
		props.onModel(model.id);
		props.close();
	}

	function move(delta: number): void {
		const count = shown().length;
		if (count === 0) return;
		const next = (active() + delta + count) % count;
		setActive(next);
		list?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
	}

	return (
		<div class="picker-model flex max-h-[inherit] flex-col">
			<Show when={view() === "root"}>
				<div class="flex flex-col gap-0.5 p-1">
					<Show when={props.efforts.length > 0}>
						<LinkRow label="Effort" onClick={() => setView("effort")}>
							<span class="truncate">{effort()?.name ?? "Default"}</span>
						</LinkRow>
					</Show>
					<LinkRow label="Model" onClick={() => setView("models")}>
						<ProviderMark
							provider={modelMark(props.models, props.model, props.agent)}
							class="size-4"
						/>
						<span class="truncate">{model()?.name || props.model}</span>
					</LinkRow>
				</div>
			</Show>
			<Show when={view() === "effort"}>
				<div class="flex flex-col gap-0.5 p-1">
					<BackRow label="Effort" onClick={() => setView("root")} />
					<For each={props.efforts}>
						{(level) => (
							<button
								type="button"
								aria-pressed={props.effort === level.id ? "true" : "false"}
								onClick={() => {
									props.onEffort(level.id);
									setView("root");
								}}
								class={`${ROW} ${rowTone(props.effort === level.id)}`}
							>
								<span class="min-w-0 flex-1 truncate">{level.name}</span>
								<Show when={props.effort === level.id}>
									<CheckIcon class="size-4 shrink-0 text-ink/70" />
								</Show>
							</button>
						)}
					</For>
				</div>
			</Show>
			<Show when={view() === "models"}>
				<div class="flex min-h-0 flex-1 flex-col">
					<div class="p-1 pb-0">
						<BackRow label="Model" onClick={() => setView("root")} />
					</div>
					<Show when={props.agents && props.agents.length > 1}>
						<ChipRow
							label="Agent"
							choices={(props.agents ?? []).map((agent) => ({ id: agent.id, name: agent.name }))}
							value={props.agent ?? null}
							onChange={(id) => props.onAgent?.(id)}
						/>
					</Show>
					<label class="mx-3 mt-2.5 flex h-9 shrink-0 items-center gap-2 rounded-md border border-ink/12 px-2.5 focus-within:border-ink/30 pointer-coarse:h-11">
						<SearchIcon class="size-4 shrink-0 text-ink/40" />
						<input
							type="search"
							value={query()}
							placeholder={`Search ${props.models.length} models`}
							aria-label="Search models"
							autocomplete="off"
							autocapitalize="off"
							spellcheck={false}
							enterkeyhint="done"
							ref={(el) => {
								// A physical keyboard types into the search at once; on phones it would pop
								// the keyboard over the list, so wait for a tap.
								if (matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => el.focus());
							}}
							onInput={(event) => {
								setQuery(event.currentTarget.value);
								setActive(0);
							}}
							onKeyDown={(event) => {
								if (event.key === "ArrowDown") {
									event.preventDefault();
									move(1);
								} else if (event.key === "ArrowUp") {
									event.preventDefault();
									move(-1);
								} else if (event.key === "Enter") {
									event.preventDefault();
									const model = shown()[active()];
									if (model) choose(model);
								}
							}}
							class="min-w-0 flex-1 bg-transparent text-ink text-ui-input outline-none placeholder:text-ink/35"
						/>
					</label>
					<div
						ref={(el) => {
							list = el;
						}}
						data-model-list
						class="mt-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2 max-md:max-h-[55dvh]"
					>
						<Show
							when={shown().length > 0}
							fallback={
								<p class="px-3 py-6 text-center text-ink/45 text-ui-sm">
									No model matches “{query()}”.
								</p>
							}
						>
							<For each={groups()}>
								{(group) => (
									<section aria-label={group.group ?? "Models"}>
										<Show when={group.group}>
											<p class="sticky top-0 z-10 bg-canvas px-2 pt-2 pb-1 font-medium text-ink/40 text-ui-caption uppercase tracking-wide">
												{group.group}
											</p>
										</Show>
										<For each={group.choices}>
											{(model) => {
												const index = () => shown().indexOf(model);
												return (
													<button
														type="button"
														aria-pressed={model.id === props.model ? "true" : "false"}
														data-index={index()}
														onMouseEnter={() => setActive(index())}
														onClick={() => choose(model)}
														class={`focus-ring flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-fast ease-out-grid pointer-coarse:min-h-11 ${rowTone(model.id === props.model, index() === active())}`}
													>
														<span class="min-w-0 flex-1">
															<span class="block truncate text-ink text-ui-sm">{model.name}</span>
															<Show when={model.description}>
																<span class="block truncate text-ink/45 text-ui-xs">
																	{model.description}
																</span>
															</Show>
														</span>
														<Show when={model.efforts?.length}>
															<span class="shrink-0 text-ink/35 text-ui-caption">
																{model.efforts?.length} efforts
															</span>
														</Show>
														<Show when={model.id === props.model}>
															<CheckIcon class="size-4 shrink-0 text-ink/70" />
														</Show>
													</button>
												);
											}}
										</For>
									</section>
								)}
							</For>
						</Show>
					</div>
				</div>
			</Show>
		</div>
	);
}

/** The mode chip: how much the agent may do without asking. */
export function ModePicker(props: {
	modes: readonly Choice[];
	mode: string;
	onMode: (id: string) => void;
	disabled?: boolean;
}): JSX.Element {
	const current = () => findChoice(props.modes, props.mode);

	return (
		<span class={`contents ${PANEL_WIDTH.mode}`}>
			<Popover
				label="Mode"
				disabled={props.disabled}
				triggerClass={CHIP}
				trigger={
					<>
						<Icon icon={MODE_ICONS[modeGlyph(current())]} class="size-4 shrink-0 text-ink/70" />
						{/* Phones show the mode's icon only, leaving the width to the model's name. */}
						<span class="hidden truncate text-ink sm:inline">{current()?.name ?? props.mode}</span>
						<span class="sr-only sm:hidden">{current()?.name ?? props.mode}</span>
						<ChevronDownIcon class="size-3 shrink-0 text-ink/40" />
					</>
				}
			>
				{(close) => (
					<div data-mode-list class="picker-mode flex flex-col gap-0.5 p-1">
						<For each={props.modes}>
							{(mode) => {
								const line = () => modeDescription(mode);
								return (
									<button
										type="button"
										aria-pressed={mode.id === props.mode ? "true" : "false"}
										onClick={() => {
											props.onMode(mode.id);
											close();
										}}
										class={`focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-fast ease-out-grid pointer-coarse:min-h-11 pointer-coarse:py-3 ${rowTone(mode.id === props.mode)}`}
									>
										<Icon
											icon={MODE_ICONS[modeGlyph(mode)]}
											class="size-3.5 shrink-0 text-ink/55"
										/>
										<span class="min-w-0 flex-1">
											<span class="block truncate font-medium text-ink text-ui">{mode.name}</span>
											<Show when={line()}>
												{(text) => (
													<span class="block truncate text-ink/50 text-ui-xs">{text()}</span>
												)}
											</Show>
										</span>
										<Show when={mode.id === props.mode}>
											<CheckIcon class="size-4 shrink-0 text-ink/70" />
										</Show>
									</button>
								);
							}}
						</For>
					</div>
				)}
			</Popover>
		</span>
	);
}
