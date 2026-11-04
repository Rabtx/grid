import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Button,
	ChoiceChips,
	Dialog,
	Field,
	Input,
	Select,
	Switch,
	Text,
	Textarea,
	ToggleChips,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { shortModelName } from "@/modules/chat/lib/choices";
import type { ChatProvider, Choice, Role, RoleDraft } from "@/modules/chat/types/chat.types";
import { connectorsService } from "@/modules/connectors/services/connectors.service";
import { skillsService } from "@/modules/skills/services/skills.service";

import { TEAMMATE_TEMPLATES, type TeammateTemplate } from "../lib/templates";

type Option = { value: string; label: string; hint?: string };

/** A section of the editor: a quiet heading over its fields. */
function Section(props: { title: string; hint?: string; children: JSX.Element }): JSX.Element {
	return (
		<section class="flex flex-col gap-3">
			<div class="flex flex-col gap-0.5">
				<Text size="caption" tone="subtle" weight="medium">
					{props.title}
				</Text>
				<Show when={props.hint}>
					<Text size="caption" tone="faint">
						{props.hint}
					</Text>
				</Show>
			</div>
			{props.children}
		</section>
	);
}

/** A setting that is on or off, said in words, with its switch on the right. */
function Toggle(props: {
	label: string;
	hint: string;
	checked: boolean;
	onChange: (on: boolean) => void;
}): JSX.Element {
	return (
		<div class="flex items-start justify-between gap-4">
			<div class="flex min-w-0 flex-col">
				<Text>{props.label}</Text>
				<Text size="caption" tone="subtle">
					{props.hint}
				</Text>
			</div>
			<Switch label={props.label} checked={props.checked} onChange={props.onChange} />
		</div>
	);
}

/**
 * Make a teammate, or change one: a template to start from (new only); its glyph, name and
 * specialty; how it works; the agent, model and effort it runs on; its skills and connectors; and
 * how it takes cards on the board (by itself, plan first, how many at once, who reviews after it).
 * A sheet on phones, a card on desktop.
 */
export function TeammateDialog(props: {
	open: boolean;
	/** The teammate to change; none makes a new one. */
	target: Role | null;
	agents: readonly ChatProvider[];
	/** The rest of the team, for who finished cards go to. */
	team: readonly Role[];
	/** The runner the team lives on (its path prefix). */
	scope?: string;
	onClose: () => void;
	onSave: (draft: RoleDraft) => Promise<void>;
	onDelete?: () => Promise<void>;
}): JSX.Element {
	const auth = useAuth();
	const [template, setTemplate] = createSignal<string | null>(null);
	const [name, setName] = createSignal("");
	const [icon, setIcon] = createSignal("code");
	const [specialty, setSpecialty] = createSignal("");
	const [brief, setBrief] = createSignal("");
	const [agent, setAgent] = createSignal("");
	const [model, setModel] = createSignal<string | null>(null);
	const [effort, setEffort] = createSignal<string | null>(null);
	const [skills, setSkills] = createSignal<string[]>([]);
	const [allTools, setAllTools] = createSignal(true);
	const [tools, setTools] = createSignal<string[]>([]);
	const [autoStart, setAutoStart] = createSignal(false);
	const [planFirst, setPlanFirst] = createSignal(true);
	const [parallel, setParallel] = createSignal(1);
	const [handoffTo, setHandoffTo] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [confirming, setConfirming] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [skillOptions, setSkillOptions] = createSignal<Option[] | null>(null);
	const [toolOptions, setToolOptions] = createSignal<Option[] | null>(null);

	// Each opening starts from the teammate (or a blank one on the first agent), and reads the
	// workspace's skills and connectors to choose from.
	createEffect(
		() => props.open,
		(open) => {
			if (!open) return;
			const role = untrack(() => props.target);
			const first = untrack(() => props.agents[0]?.id ?? "");
			setTemplate(null);
			setName(role?.name ?? "");
			setIcon(role?.icon ?? "code");
			setSpecialty(role?.specialty ?? "");
			setBrief(role?.brief ?? "");
			setAgent(role?.provider ?? first);
			setModel(role?.model ?? null);
			setEffort(role?.effort ?? null);
			setSkills(role?.skills ?? []);
			setAllTools(role ? role.connectors === null : true);
			setTools(role?.connectors ?? []);
			setAutoStart(role?.autoStart ?? false);
			setPlanFirst(role?.planFirst ?? true);
			setParallel(role?.parallel ?? 1);
			setHandoffTo(role?.handoffTo ?? null);
			setConfirming(false);
			setError(null);
			const token = untrack(auth.token);
			if (!token) return;
			void skillsService.view(token).then(
				(view) =>
					setSkillOptions(
						view.skills.map((skill) => ({
							value: skill.id,
							label: skill.name,
							hint: skill.description,
						})),
					),
				() => setSkillOptions([]),
			);
			void connectorsService.view(token).then(
				(view) =>
					setToolOptions(
						view.connections
							.filter((item) => item.enabled)
							.map((item) => ({ value: item.id, label: item.name })),
					),
				() => setToolOptions([]),
			);
		},
	);

	function useTemplate(chosen: TeammateTemplate): void {
		setTemplate(chosen.id);
		// A name already typed is kept; the template only suggests one.
		if (!name().trim() || TEAMMATE_TEMPLATES.some((item) => item.name === name()))
			setName(chosen.name);
		setIcon(chosen.icon);
		setSpecialty(chosen.specialty);
		setBrief(chosen.brief);
		setPlanFirst(chosen.planFirst);
	}

	const provider = () => props.agents.find((item) => item.id === agent()) ?? null;
	const models = () => provider()?.models ?? [];
	const chosenModel = (): Choice | undefined =>
		models().find((item) => item.id === model()) ??
		models().find((item) => item.id === provider()?.settings?.model) ??
		models()[0];
	const others = () => props.team.filter((item) => item.id !== props.target?.id);

	async function save(): Promise<void> {
		if (!name().trim()) {
			setError("Give the teammate a name");
			return;
		}
		setBusy(true);
		setError(null);
		try {
			await props.onSave({
				name: name().trim(),
				icon: icon(),
				specialty: specialty().trim(),
				brief: brief().trim(),
				provider: agent(),
				// What was picked; unpicked stays the agent's default.
				model: model(),
				effort: effort(),
				mode: props.target?.mode ?? null,
				skills: skills(),
				connectors: allTools() ? null : tools(),
				autoStart: autoStart(),
				planFirst: planFirst(),
				parallel: parallel(),
				handoffTo: handoffTo(),
			});
			props.onClose();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not save the teammate");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title={props.target ? `Edit ${props.target.name}` : "New teammate"}
			width="34rem"
		>
			<form
				class="flex flex-col gap-6"
				onSubmit={(event) => {
					event.preventDefault();
					void save();
				}}
			>
				<Show when={!props.target}>
					<ChoiceChips
						label="Start from"
						value={template() ?? ""}
						onChange={(id) => {
							const chosen = TEAMMATE_TEMPLATES.find((item) => item.id === id);
							if (chosen) useTemplate(chosen);
						}}
						options={TEAMMATE_TEMPLATES.map((item) => ({ value: item.id, label: item.specialty }))}
					/>
				</Show>

				<div class="flex flex-col gap-3">
					<div class="grid gap-3 sm:grid-cols-2">
						<Field label="Name">
							{(id) => (
								<Input
									id={id}
									value={name()}
									maxlength={40}
									placeholder="Riley"
									onInput={(event) => setName(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field label="Specialty">
							{(id) => (
								<Input
									id={id}
									value={specialty()}
									maxlength={60}
									placeholder="Frontend engineer"
									onInput={(event) => setSpecialty(event.currentTarget.value)}
								/>
							)}
						</Field>
					</div>
					<Field label="How it works" hint="Goes with the first message of every thread it takes.">
						{(id) => (
							<Textarea
								id={id}
								rows={4}
								maxlength={2000}
								value={brief()}
								placeholder="Ships UI with the design tokens. Prefers small PRs with screenshots."
								onInput={(event) => setBrief(event.currentTarget.value)}
							/>
						)}
					</Field>
				</div>

				<div class="flex flex-col gap-3">
					<div class="grid gap-3 sm:grid-cols-2">
						<Field label="Agent">
							{() => (
								<Select
									label="Agent"
									value={agent()}
									onChange={(id) => {
										setAgent(id);
										setModel(null);
										setEffort(null);
									}}
									groups={[
										{
											options: props.agents.map((item) => ({
												value: item.id,
												label: item.name,
												icon: <AgentLogo id={item.id} name={item.name} />,
											})),
										},
									]}
								/>
							)}
						</Field>
						<Show when={models().length > 0}>
							<Field label="Model">
								{() => (
									<Select
										label="Model"
										value={chosenModel()?.id ?? ""}
										onChange={(id) => {
											setModel(id);
											setEffort(null);
										}}
										groups={[
											{
												options: models().map((item) => ({
													value: item.id,
													label: shortModelName(item.name),
												})),
											},
										]}
									/>
								)}
							</Field>
						</Show>
					</div>
				</div>

				<Section title="Skills">
					<Show
						when={skillOptions()?.length}
						fallback={
							<Text size="caption" tone="subtle">
								{skillOptions() === null
									? "Reading skills…"
									: "No skills yet: add them in Settings → Skills."}
							</Text>
						}
					>
						<ToggleChips
							label="Skills"
							labelHidden
							options={skillOptions() ?? []}
							value={skills()}
							onChange={setSkills}
						/>
					</Show>
				</Section>

				<Section title="Tools">
					<Toggle
						label="Every connector"
						hint="Whatever its agent may use in this workspace"
						checked={allTools()}
						onChange={setAllTools}
					/>
					<Show when={!allTools()}>
						<Show
							when={toolOptions()?.length}
							fallback={
								<Text size="caption" tone="subtle">
									{toolOptions() === null
										? "Reading connectors…"
										: "No connectors yet: add them in Settings → Connectors."}
								</Text>
							}
						>
							<ToggleChips
								label="Connectors"
								labelHidden
								options={toolOptions() ?? []}
								value={tools()}
								onChange={setTools}
							/>
						</Show>
					</Show>
				</Section>

				<Section title="On the board">
					<Toggle
						label="Start cards by itself"
						hint="Begins as soon as a card is assigned, in its own worktree"
						checked={autoStart()}
						onChange={setAutoStart}
					/>
					<Toggle
						label="Plan first"
						hint="Writes a plan and waits for you to approve it"
						checked={planFirst()}
						onChange={setPlanFirst}
					/>
					<div class="grid gap-3 sm:grid-cols-2">
						<Field label="Cards at once">
							{() => (
								<Select
									label="Cards at once"
									value={String(parallel())}
									onChange={(value) => setParallel(Number(value))}
									groups={[
										{
											options: [1, 2, 3, 4, 5].map((count) => ({
												value: String(count),
												label: count === 1 ? "One at a time" : `${count} at once`,
											})),
										},
									]}
								/>
							)}
						</Field>
						<Field label="When done, hand to">
							{() => (
								<Select
									label="When done, hand to"
									value={handoffTo() ?? ""}
									onChange={(value) => setHandoffTo(value || null)}
									groups={[
										{
											options: [
												{ value: "", label: "Nobody: straight to review" },
												...others().map((item) => ({
													value: item.id,
													label: item.specialty ? `${item.name} · ${item.specialty}` : item.name,
												})),
											],
										},
									]}
								/>
							)}
						</Field>
					</div>
				</Section>

				<Show when={error()}>
					{(message) => (
						<Text size="caption" tone="danger">
							{message()}
						</Text>
					)}
				</Show>
				<div class="flex flex-col-reverse gap-2 md:flex-row md:items-center">
					<Show when={props.target && props.onDelete}>
						<Button
							variant="danger"
							size="xl"
							disabled={busy()}
							onClick={async () => {
								if (!confirming()) {
									setConfirming(true);
									return;
								}
								setBusy(true);
								try {
									await props.onDelete?.();
									props.onClose();
								} catch (cause) {
									setError(
										cause instanceof Error ? cause.message : "Could not remove the teammate",
									);
								} finally {
									setBusy(false);
								}
							}}
						>
							{confirming() ? "Remove — sure?" : "Remove teammate"}
						</Button>
					</Show>
					<span class="hidden flex-1 md:block" />
					<Button type="submit" variant="primary" size="xl" disabled={busy() || !agent()}>
						{busy() ? "Saving…" : props.target ? "Save teammate" : "Add to team"}
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
