import CompassIcon from "@hugeicons/core-free-icons/CompassIcon";
import LockKeyholeIcon from "@hugeicons/core-free-icons/LockKeyholeIcon";
import LockKeyholeOpenIcon from "@hugeicons/core-free-icons/LockKeyholeOpenIcon";
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
	AgentMark,
	CheckIcon,
	ChevronDownIcon,
	ChoiceRail,
	EffortSlider,
	FlagshipMark,
	Icon,
	type IconData,
	ModelRow,
	Popover,
	PROMPT_CHIP,
	type RailItem,
	SearchIcon,
	SearchInput,
	Select,
	SparklesIcon,
	StarIcon,
	Text,
} from "@/kit";

import {
	filterChoices,
	findChoice,
	modeDescription,
	modeGlyph,
	type ModeGlyph,
	shortModelName,
} from "../lib/choices";
import { celebrateModel, isFlagship } from "../lib/celebrate";
import { favoritesStore } from "../stores/favorites";
import type { ChatProvider, Choice } from "../types/chat.types";

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

const FAVORITES = "favorites";

/** A model and the agent that offers it: favourites mix agents, so each carries its own. */
type Entry = { agent: string; agentName: string; choice: Choice };

type ModelPickerProps = {
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
};

/**
 * The model chip and its panel. A rail picks what the list shows — your favourites, or one of the
 * agents on this machine — and the list is that agent's models, grouped by the lab behind them and
 * searchable, with the chosen model's effort along the bottom. Picking a model of another agent
 * switches to it. A panel above the chip on desktop, a bottom sheet on phones. A flagship pick
 * lights the grid.
 */
export function ModelPicker(props: ModelPickerProps): JSX.Element {
	const model = () => findChoice(props.models, props.model);
	const effort = () => findChoice(props.efforts, props.effort);
	const name = () => shortModelName(model()?.name || props.model || "Model");

	return (
		<Popover
			label="Model"
			placement="top-start"
			width="md:w-xl"
			disabled={props.disabled}
			triggerClass={`${PROMPT_CHIP} min-w-0 max-w-64`}
			trigger={
				<>
					<AgentMark name={modelMark(props.models, props.model, props.agent)} size="md" />
					<Text as="span" size="inherit" tone="strong" truncate>
						{name()}
					</Text>
					<Show when={model() && isFlagship(model() as Choice)}>
						<SparklesIcon size="xs" class="shrink-0 text-accent" />
					</Show>
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

function ModelPanel(props: ModelPickerProps & { close: () => void }): JSX.Element {
	const current = () => props.agent ?? "agent";
	const agents = () => (props.agents && props.agents.length > 0 ? props.agents : null);
	const agentName = (id: string) => agents()?.find((agent) => agent.id === id)?.name ?? id;
	const modelsOf = (id: string): readonly Choice[] =>
		id === current() || !agents()
			? props.models
			: (agents()?.find((a) => a.id === id)?.models ?? []);
	const everyEntry = createMemo<Entry[]>(() =>
		(agents() ?? [{ id: current(), name: agentName(current()), models: props.models }]).flatMap(
			(agent) =>
				(agent.id === current() ? props.models : agent.models).map((choice) => ({
					agent: agent.id,
					agentName: agent.name,
					choice,
				})),
		),
	);
	const favorites = createMemo(() =>
		everyEntry().filter((entry) => favoritesStore.has(entry.agent, entry.choice.id)),
	);
	const [view, setView] = createSignal(current());
	const [query, setQuery] = createSignal("");
	const [active, setActive] = createSignal(0);
	let list: HTMLDivElement | undefined;

	const rail = (): RailItem[] => [
		...(favorites().length > 0
			? [{ id: FAVORITES, label: "Favourites", icon: <StarIcon size="sm" class="text-warning" /> }]
			: []),
		...(agents() ?? []).map((agent) => ({
			id: agent.id,
			label: agent.name,
			icon: <AgentMark name={agent.name} size="md" />,
		})),
	];
	const showRail = () => rail().length > 1 || (rail().length === 1 && favorites().length > 0);

	const shown = createMemo<Entry[]>(() => {
		const source =
			view() === FAVORITES
				? favorites()
				: modelsOf(view()).map((choice) => ({
						agent: view(),
						agentName: agentName(view()),
						choice,
					}));
		const matches = new Set(
			filterChoices(
				source.map((entry) => entry.choice),
				query(),
			),
		);
		return source.filter((entry) => matches.has(entry.choice));
	});
	// Favourites group by agent; an agent's own list by the lab behind each model.
	const groups = createMemo(() => {
		const byGroup = new Map<string, Entry[]>();
		for (const entry of shown()) {
			const key = view() === FAVORITES ? entry.agentName : (entry.choice.group ?? "");
			byGroup.set(key, [...(byGroup.get(key) ?? []), entry]);
		}
		return [...byGroup.entries()].map(([group, entries]) => ({ group, entries }));
	});

	function pick(entry: Entry): void {
		if (entry.agent !== current()) props.onAgent?.(entry.agent);
		props.onModel(entry.choice.id);
		celebrateModel(entry.choice);
		props.close();
	}

	function rowAt(index: number): HTMLElement | null {
		return list?.querySelector<HTMLElement>(`[data-index="${index}"]`) ?? null;
	}

	function move(delta: number): void {
		const count = shown().length;
		if (count === 0) return;
		const next = (active() + delta + count) % count;
		setActive(next);
		rowAt(next)?.scrollIntoView({ block: "nearest" });
	}

	return (
		<div class="flex min-h-0 flex-col">
			<div class="border-line border-b p-2">
				<SearchInput
					icon={<SearchIcon />}
					value={query()}
					placeholder={
						view() === FAVORITES ? "Search favourites" : `Search ${modelsOf(view()).length} models`
					}
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
							const entry = shown()[active()];
							if (entry) pick(entry);
						}
					}}
				/>
			</div>
			<div class="flex min-h-0 flex-1 flex-col md:flex-row">
				<Show when={showRail()}>
					<ChoiceRail
						label="Show models from"
						items={rail()}
						value={view()}
						onChange={(id) => {
							setView(id);
							setActive(0);
							if (list) list.scrollTop = 0;
						}}
					/>
				</Show>
				<div
					ref={(el) => {
						list = el;
					}}
					data-model-list
					class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 max-h-96 md:max-h-80"
				>
					<Show
						when={shown().length > 0}
						fallback={
							<Text tone="subtle" class="px-3 py-8 text-center">
								{query() ? `No model matches “${query()}”.` : "No models here yet."}
							</Text>
						}
					>
						<For each={groups()}>
							{(group) => (
								<section aria-label={group.group || "Models"}>
									<Show when={group.group}>
										<p class="sticky top-0 z-10 bg-surface-raised px-2.5 pt-2 pb-1 text-caption text-fg-subtle">
											{group.group}
										</p>
									</Show>
									<For each={group.entries}>
										{(entry) => {
											const index = () => shown().indexOf(entry);
											const chosen = () =>
												entry.agent === current() && entry.choice.id === props.model;
											return (
												<ModelRow
													index={index()}
													name={entry.choice.name}
													description={entry.choice.description}
													badge={
														isFlagship(entry.choice) ? (
															<FlagshipMark>
																<SparklesIcon size="xs" />
															</FlagshipMark>
														) : undefined
													}
													detail={
														chosen() ? (
															<CheckIcon size="sm" class="text-fg" />
														) : entry.choice.efforts?.length ? (
															`${entry.choice.efforts.length} efforts`
														) : undefined
													}
													selected={chosen()}
													active={index() === active()}
													favorite={favoritesStore.has(entry.agent, entry.choice.id)}
													onFavorite={() => favoritesStore.toggle(entry.agent, entry.choice.id)}
													onHover={() => setActive(index())}
													onPick={() => pick(entry)}
												/>
											);
										}}
									</For>
								</section>
							)}
						</For>
					</Show>
				</div>
			</div>
			<Show when={props.efforts.length > 0}>
				<div class="border-line border-t px-4 pt-2.5 pb-3">
					<EffortSlider
						label="Reasoning effort"
						levels={props.efforts}
						value={props.effort}
						onChange={(id) => props.onEffort(id)}
					/>
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
