import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";

import { CheckIcon, ChevronDownIcon, Popover, SearchIcon } from "@/ui";

import { filterChoices, groupChoices } from "../lib/choices";
import type { ChatProvider, Choice } from "../types/chat.types";

const PILL =
	"focus-ring inline-flex h-7 min-w-0 max-w-[15rem] shrink items-center gap-1.5 rounded-md border border-ink/10 px-2 text-ink/70 text-ui-xs transition-colors duration-fast ease-out-grid hover:bg-ink/6 hover:text-ink disabled:opacity-40 aria-expanded:bg-ink/8 aria-expanded:text-ink pointer-coarse:h-9";

const CHIP =
	"focus-ring shrink-0 rounded-md border border-ink/10 px-2.5 py-1 text-ink/70 text-ui-xs transition-colors duration-fast ease-out-grid hover:bg-ink/6 aria-pressed:border-ink/30 aria-pressed:bg-ink aria-pressed:text-canvas pointer-coarse:py-2";

/** A row of mutually exclusive chips inside a picker: the agent, the effort level. */
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
							class={CHIP}
						>
							{choice.name}
						</button>
					)}
				</For>
			</div>
		</fieldset>
	);
}

/**
 * The model pill and its panel: which agent (on a new chat), how hard it thinks (for models with
 * effort levels), and a searchable list of the agent's models, grouped by provider. A bottom sheet
 * on phones, a panel above the pill on desktop; never the platform's own picker.
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
	const current = () => props.models.find((model) => model.id === props.model);
	const effortName = () => props.efforts.find((effort) => effort.id === props.effort)?.name;
	const label = () => {
		const name = current()?.name ?? (props.model || "Model");
		return effortName() ? `${name} · ${effortName()}` : name;
	};

	return (
		<Popover
			label="Model"
			disabled={props.disabled}
			triggerClass={PILL}
			trigger={
				<>
					<Show when={props.agents && props.agent}>
						<span class="shrink-0 font-medium text-ink/80">
							{props.agents?.find((agent) => agent.id === props.agent)?.name}
						</span>
					</Show>
					<span class="truncate">{label()}</span>
					<ChevronDownIcon class="size-3 shrink-0 text-ink/40" />
				</>
			}
		>
			{(close) => <ModelPanel {...props} close={close} />}
		</Popover>
	);
}

function ModelPanel(props: Parameters<typeof ModelPicker>[0] & { close: () => void }): JSX.Element {
	const [query, setQuery] = createSignal("");
	const [active, setActive] = createSignal(0);
	const shown = createMemo(() => filterChoices(props.models, query()));
	const groups = createMemo(() => groupChoices(shown()));
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
		<div class="flex max-h-[inherit] flex-col">
			<Show when={props.agents && props.agents.length > 1}>
				<ChipRow
					label="Agent"
					choices={(props.agents ?? []).map((agent) => ({ id: agent.id, name: agent.name }))}
					value={props.agent ?? null}
					onChange={(id) => props.onAgent?.(id)}
				/>
			</Show>
			<Show when={props.efforts.length > 0}>
				<ChipRow
					label="Effort"
					choices={props.efforts}
					value={props.effort}
					onChange={props.onEffort}
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
												data-active={index() === active() ? "" : undefined}
												onMouseEnter={() => setActive(index())}
												onClick={() => choose(model)}
												class="focus-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-fast ease-out-grid data-[active]:bg-ink/8 pointer-coarse:py-2.5"
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
	);
}

/** The mode pill: how much the agent may do without asking. */
export function ModePicker(props: {
	modes: readonly Choice[];
	mode: string;
	onMode: (id: string) => void;
	disabled?: boolean;
}): JSX.Element {
	const current = () => props.modes.find((mode) => mode.id === props.mode);
	return (
		<Popover
			label="Mode"
			disabled={props.disabled}
			triggerClass={PILL}
			trigger={
				<>
					<span class="truncate">{current()?.name ?? props.mode}</span>
					<ChevronDownIcon class="size-3 shrink-0 text-ink/40" />
				</>
			}
		>
			{(close) => (
				<div data-mode-list class="flex flex-col gap-0.5 p-1.5">
					<For each={props.modes}>
						{(mode) => (
							<button
								type="button"
								aria-pressed={mode.id === props.mode ? "true" : "false"}
								onClick={() => {
									props.onMode(mode.id);
									close();
								}}
								class="focus-ring flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors duration-fast ease-out-grid hover:bg-ink/8 pointer-coarse:py-3"
							>
								<span class="min-w-0 flex-1">
									<span class="block text-ink text-ui-sm">{mode.name}</span>
									<Show when={mode.description}>
										<span class="block text-ink/45 text-ui-xs">{mode.description}</span>
									</Show>
								</span>
								<Show when={mode.id === props.mode}>
									<CheckIcon class="size-4 shrink-0 text-ink/70" />
								</Show>
							</button>
						)}
					</For>
				</div>
			)}
		</Popover>
	);
}
