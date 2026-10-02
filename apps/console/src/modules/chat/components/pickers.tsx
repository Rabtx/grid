import CompassIcon from "@hugeicons/core-free-icons/CompassIcon";
import Layers01Icon from "@hugeicons/core-free-icons/Layers01Icon";
import LockKeyholeIcon from "@hugeicons/core-free-icons/LockKeyholeIcon";
import LockKeyholeOpenIcon from "@hugeicons/core-free-icons/LockKeyholeOpenIcon";
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js";

import {
	type AgentChoice,
	AgentChoices,
	AgentLogo,
	AgentMark,
	Badge,
	ChevronDownIcon,
	EffortSlider,
	Icon,
	type IconData,
	ModelRow,
	Popover,
	type PopoverControl,
	PROMPT_CHIP,
	SearchIcon,
	SearchInput,
	Select,
	Text,
} from "@/kit";

import {
	filterChoices,
	findChoice,
	foldDefault,
	modelBlurb,
	modeDescription,
	modeGlyph,
	type ModeGlyph,
	shortModelName,
} from "../lib/choices";
import { celebrateModel } from "../lib/celebrate";
import { favoritesStore } from "../stores/favorites";
import type { ChatProvider, Choice } from "../types/chat.types";

const MODE_ICONS: Record<ModeGlyph, IconData> = {
	lock: LockKeyholeIcon,
	edit: PencilEdit01Icon,
	plan: CompassIcon,
	open: LockKeyholeOpenIcon,
};

/** Who makes an agent, for the line under its name; agents Grid does not know get none. */
const MAKERS: Record<string, string> = {
	claude: "Anthropic",
	codex: "OpenAI",
	gemini: "Google",
	antigravity: "Google",
	opencode: "Any provider",
};

/** A long list gets a search and its labs as headings; a short one is just the rows. */
const LONG_LIST = 8;

type ModelPickerProps = {
	agents?: readonly ChatProvider[];
	agent?: string;
	/** The agent's name, when `agents` is not given (a thread's agent is fixed). */
	agentName?: string;
	onAgent?: (id: string) => void;
	models: readonly Choice[];
	model: string;
	onModel: (id: string) => void;
	efforts: readonly Choice[];
	effort: string | null;
	onEffort: (id: string) => void;
	disabled?: boolean;
	/** Hands over a way to open the panel from code, e.g. the composer's `/model` command. */
	control?: (control: PopoverControl) => void;
};

/**
 * The agent-and-model chip and its panel (Figma 10 · Composer, Model picker): the agent, when it
 * can still change; its models, each with a line about it; the chosen model's reasoning effort
 * along the bottom. A long list (an agent with many providers) gets a search, its favourites first
 * and its labs as headings. A panel above the chip on desktop, a sheet on phones. A flagship pick
 * lights the grid.
 */
export function ModelPicker(props: ModelPickerProps): JSX.Element {
	const model = () => findChoice(props.models, props.model);
	const name = () => shortModelName(model()?.name || props.model || "Model");
	const agentName = () =>
		props.agents?.find((agent) => agent.id === props.agent)?.name ?? props.agentName ?? null;

	return (
		<Popover
			label="Agent and model"
			title={props.agents && props.agents.length > 1 ? "Agent & model" : "Model"}
			placement="top-start"
			width="md:w-96"
			disabled={props.disabled}
			control={props.control}
			triggerClass={`${PROMPT_CHIP} min-w-0 max-w-72`}
			trigger={
				<>
					<Show
						when={props.agent && agentName()}
						fallback={
							<AgentMark name={findChoice(props.models, props.model)?.group || "model"} size="md" />
						}
					>
						<AgentLogo id={props.agent ?? ""} name={agentName() ?? ""} />
					</Show>
					<Text as="span" size="inherit" tone="strong" truncate>
						{agentName() ? `${agentName()} · ${name()}` : name()}
					</Text>
					<ChevronDownIcon size="xs" class="text-fg-faint" />
				</>
			}
		>
			{(close) => <ModelPanel {...props} close={close} />}
		</Popover>
	);
}

function ModelPanel(props: ModelPickerProps & { close: () => void }): JSX.Element {
	const agent = () => props.agent ?? "agent";
	const folded = createMemo(() => foldDefault(props.models));
	const long = () => folded().choices.length > LONG_LIST;
	const [query, setQuery] = createSignal("");
	const [active, setActive] = createSignal(-1);
	let list: HTMLDivElement | undefined;
	const agentId = createUniqueId();
	const modelId = createUniqueId();

	const shown = createMemo<Choice[]>(() => {
		const all = folded().choices;
		const matches = new Set(long() ? filterChoices(all, query()) : all);
		const kept = all.filter((choice) => matches.has(choice));
		// Favourites first, the rest in the agent's order.
		const favourite = (choice: Choice) => favoritesStore.has(agent(), choice.id);
		return [...kept.filter(favourite), ...kept.filter((choice) => !favourite(choice))];
	});
	// A long list's runs: its favourites, then each lab behind its models.
	const groups = createMemo(() => {
		if (!long()) return [{ group: "", choices: shown() }];
		const byGroup = new Map<string, Choice[]>();
		for (const choice of shown()) {
			const key = favoritesStore.has(agent(), choice.id) ? "Favourites" : (choice.group ?? "");
			byGroup.set(key, [...(byGroup.get(key) ?? []), choice]);
		}
		return [...byGroup.entries()].map(([group, choices]) => ({ group, choices }));
	});

	const chosen = (choice: Choice) =>
		choice.id === props.model || folded().aliases.get(choice.id) === props.model;

	function pick(choice: Choice): void {
		props.onModel(choice.id);
		celebrateModel(choice);
		props.close();
	}

	function move(delta: number): void {
		const count = shown().length;
		if (count === 0) return;
		const next = (active() + delta + count) % count;
		setActive(next);
		list?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
	}

	const agentChoices = (): AgentChoice[] =>
		(props.agents ?? []).map((item) => ({
			id: item.id,
			name: item.name,
			detail:
				[MAKERS[item.id], item.setup?.signedIn === false ? "sign in needed" : null]
					.filter(Boolean)
					.join(" · ") || undefined,
			logo: <AgentLogo id={item.id} name={item.name} />,
		}));

	return (
		<div class="flex min-h-0 flex-col pb-2 md:py-1.5">
			<Show when={props.agents && props.agents.length > 1}>
				<section aria-labelledby={agentId} class="flex flex-col gap-1.5 px-3 pb-2 md:px-1.5">
					<h3 id={agentId} class="px-1 pt-1 text-caption text-fg-subtle md:px-1.5">
						Agent
					</h3>
					<AgentChoices
						label="Agent"
						items={agentChoices()}
						value={agent()}
						onChange={(id) => {
							if (id !== agent()) props.onAgent?.(id);
						}}
					/>
				</section>
				<div class="mx-3 h-px bg-line md:mx-0" />
			</Show>
			<section aria-labelledby={modelId} class="flex min-h-0 flex-col pt-1.5">
				<h3
					id={modelId}
					class={`px-4 pb-1 text-caption text-fg-subtle md:px-3 ${props.agents && props.agents.length > 1 ? "" : "sr-only"}`}
				>
					Model
				</h3>
				<Show when={long()}>
					<div class="px-3 pb-1.5 md:px-1.5">
						<SearchInput
							icon={<SearchIcon />}
							value={query()}
							placeholder={`Search ${folded().choices.length} models`}
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
									const choice = shown()[Math.max(0, active())];
									if (choice) pick(choice);
								}
							}}
						/>
					</div>
				</Show>
				{/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- arrow keys between the row buttons inside it */}
				<div
					ref={(el) => {
						list = el;
						// A short list has no search to type into: a physical keyboard starts on the chosen
						// model, and the arrows move between the rows.
						if (!long() && matchMedia("(pointer: fine)").matches) {
							requestAnimationFrame(() =>
								el.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus(),
							);
						}
					}}
					onKeyDown={(event) => {
						if (long() || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
						const rows = [
							...(list?.querySelectorAll<HTMLElement>(
								"button[aria-pressed]:not([aria-label*='favourites'])",
							) ?? []),
						];
						const at = rows.indexOf(document.activeElement as HTMLElement);
						if (at === -1) return;
						event.preventDefault();
						rows[(at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
					}}
					data-model-list
					class={`min-h-0 overflow-y-auto overscroll-contain px-3 md:px-1.5 ${long() ? "max-h-80 md:max-h-72" : ""}`}
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
										<p class="sticky top-0 z-10 bg-surface-raised px-2 pt-2 pb-1 text-caption text-fg-subtle">
											{group.group}
										</p>
									</Show>
									<For each={group.choices}>
										{(choice) => {
											const index = () => shown().indexOf(choice);
											return (
												<ModelRow
													index={index()}
													icon={<Icon icon={Layers01Icon} size="sm" />}
													name={choice.name}
													description={modelBlurb(choice)}
													title={folded().aliases.get(choice.id) ?? choice.id}
													badge={
														<Show when={folded().defaults.has(choice.id)}>
															<Badge>Default</Badge>
														</Show>
													}
													selected={chosen(choice)}
													active={index() === active()}
													favorite={favoritesStore.has(agent(), choice.id)}
													onFavorite={() => favoritesStore.toggle(agent(), choice.id)}
													onHover={() => setActive(index())}
													onPick={() => pick(choice)}
												/>
											);
										}}
									</For>
								</section>
							)}
						</For>
					</Show>
				</div>
			</section>
			<Show when={props.efforts.length > 0}>
				<div class="mx-3 mt-1.5 h-px bg-line md:mx-0" />
				<div class="px-4 pt-3 pb-2 md:px-3">
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
	/** Hands over a way to open the panel from code, e.g. the composer's `/mode` command. */
	control?: (control: PopoverControl) => void;
}): JSX.Element {
	return (
		<Select
			label="Mode"
			look="chip"
			placement="top-start"
			width="md:w-72"
			disabled={props.disabled}
			control={props.control}
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
