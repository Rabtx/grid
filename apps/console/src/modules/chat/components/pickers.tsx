import CompassIcon from "@hugeicons/core-free-icons/CompassIcon";
import LockKeyholeIcon from "@hugeicons/core-free-icons/LockKeyholeIcon";
import LockKeyholeOpenIcon from "@hugeicons/core-free-icons/LockKeyholeOpenIcon";
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
	AgentMark,
	BackIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	Icon,
	type IconData,
	MENU_ITEM,
	Popover,
	PROMPT_CHIP,
	SearchIcon,
	SearchInput,
	Segmented,
	Select,
	Stack,
	Text,
} from "@/kit";

import {
	filterChoices,
	findChoice,
	groupChoices,
	modeDescription,
	modeGlyph,
	type ModeGlyph,
} from "../lib/choices";
import type { ChatProvider, Choice } from "../types/chat.types";

/** A panel row: selected on the fill, the keyboard's row lit, the rest on hover. */
function row(selected: boolean, active = false): string {
	return `${MENU_ITEM} h-auto min-h-kit-row py-1.5 text-fg ${selected ? "bg-fill-strong" : active ? "bg-fill" : "hover:bg-fill"}`;
}

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

/** One panel row: its label on the left, the value and a chevron on the right. */
function LinkRow(props: {
	label: string;
	onClick: () => void;
	children?: JSX.Element;
}): JSX.Element {
	return (
		<button type="button" onClick={props.onClick} class={row(false)}>
			<Text as="span" size="inherit" tone="strong">
				{props.label}
			</Text>
			<span class="ml-auto flex min-w-0 items-center gap-1.5 text-fg-subtle">{props.children}</span>
			<ChevronRightIcon size="xs" class="text-fg-faint" />
		</button>
	);
}

/** The way back to the panel's first view, named after the view you left. */
function BackRow(props: { label: string; onClick: () => void }): JSX.Element {
	return (
		<button type="button" onClick={props.onClick} class={row(false)}>
			<BackIcon class="text-fg-subtle" />
			<Text as="span" size="inherit" tone="strong">
				{props.label}
			</Text>
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
		<Popover
			label="Model"
			placement="top-start"
			width="md:w-72"
			disabled={props.disabled}
			triggerClass={`${PROMPT_CHIP} min-w-0 max-w-60`}
			trigger={
				<>
					<AgentMark name={modelMark(props.models, props.model, props.agent)} size="md" />
					<Text as="span" size="inherit" tone="strong" truncate>
						{name()}
					</Text>
					<Show when={effort()}>
						{(level) => (
							<Text as="span" size="inherit" tone="subtle" class="shrink-0">
								{level().name}
							</Text>
						)}
					</Show>
					<ChevronDownIcon size="xs" class="text-fg-faint" />
				</>
			}
		>
			{(close) => <ModelPanel {...props} close={close} />}
		</Popover>
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

	function choose(choice: Choice): void {
		props.onModel(choice.id);
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
		<div class="flex min-h-0 flex-col">
			<Show when={view() === "root"}>
				<Stack gap={0.5} class="p-1.5 md:p-1">
					<Show when={props.efforts.length > 0}>
						<LinkRow label="Effort" onClick={() => setView("effort")}>
							<Text as="span" size="inherit" tone="inherit" truncate>
								{effort()?.name ?? "Default"}
							</Text>
						</LinkRow>
					</Show>
					<LinkRow label="Model" onClick={() => setView("models")}>
						<AgentMark name={modelMark(props.models, props.model, props.agent)} size="md" />
						<Text as="span" size="inherit" tone="inherit" truncate>
							{model()?.name || props.model}
						</Text>
					</LinkRow>
				</Stack>
			</Show>
			<Show when={view() === "effort"}>
				<Stack gap={0.5} class="p-1.5 md:p-1">
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
								class={row(props.effort === level.id)}
							>
								<Text as="span" size="inherit" tone="inherit" truncate class="flex-1">
									{level.name}
								</Text>
								<Show when={props.effort === level.id}>
									<CheckIcon />
								</Show>
							</button>
						)}
					</For>
				</Stack>
			</Show>
			<Show when={view() === "models"}>
				<div class="flex min-h-0 flex-1 flex-col">
					<div class="p-1.5 pb-0 md:p-1 md:pb-0">
						<BackRow label="Model" onClick={() => setView("root")} />
					</div>
					<Show when={props.agents && props.agents.length > 1}>
						<div class="px-3 pt-2">
							<Segmented
								label="Agent"
								block
								options={(props.agents ?? []).map((agent) => ({
									value: agent.id,
									label: agent.name,
								}))}
								value={props.agent ?? ""}
								onChange={(id) => props.onAgent?.(id)}
							/>
						</div>
					</Show>
					<SearchInput
						icon={<SearchIcon />}
						class="mx-3 mt-2.5"
						value={query()}
						placeholder={`Search ${props.models.length} models`}
						aria-label="Search models"
						autocomplete="off"
						autocapitalize="off"
						spellcheck={false}
						enterkeyhint="done"
						ref={(el: HTMLInputElement) => {
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
								const choice = shown()[active()];
								if (choice) choose(choice);
							}
						}}
					/>
					<div
						ref={(el) => {
							list = el;
						}}
						data-model-list
						class="mt-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2 max-h-80"
					>
						<Show
							when={shown().length > 0}
							fallback={
								<Text tone="subtle" class="px-3 py-6 text-center">
									No model matches “{query()}”.
								</Text>
							}
						>
							<For each={groups()}>
								{(group) => (
									<section aria-label={group.group ?? "Models"}>
										<Show when={group.group}>
											<p class="sticky top-0 z-10 bg-surface-raised px-2 pt-2 pb-1 text-caption text-fg-subtle">
												{group.group}
											</p>
										</Show>
										<For each={group.choices}>
											{(choice) => {
												const index = () => shown().indexOf(choice);
												return (
													<button
														type="button"
														aria-pressed={choice.id === props.model ? "true" : "false"}
														data-index={index()}
														onMouseEnter={() => setActive(index())}
														onClick={() => choose(choice)}
														class={row(choice.id === props.model, index() === active())}
													>
														<span class="flex min-w-0 flex-1 flex-col">
															<Text as="span" size="inherit" tone="strong" truncate>
																{choice.name}
															</Text>
															<Show when={choice.description}>
																<Text as="span" size="caption" tone="subtle" truncate>
																	{choice.description}
																</Text>
															</Show>
														</span>
														<Show when={choice.efforts?.length}>
															<Text as="span" size="caption" tone="faint" class="shrink-0">
																{choice.efforts?.length} efforts
															</Text>
														</Show>
														<Show when={choice.id === props.model}>
															<CheckIcon />
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
	return (
		<Select
			label="Mode"
			look="chip"
			placement="top-start"
			width="md:w-72"
			disabled={props.disabled}
			value={props.mode}
			onChange={props.onMode}
			groups={[
				{
					options: props.modes.map((mode) => ({
						value: mode.id,
						label: mode.name,
						description: modeDescription(mode) ?? undefined,
						icon: <Icon icon={MODE_ICONS[modeGlyph(mode)]} size="sm" />,
					})),
				},
			]}
		/>
	);
}
