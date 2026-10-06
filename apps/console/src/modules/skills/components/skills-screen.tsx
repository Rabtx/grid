import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, onCleanup, onSettled, Show } from "solid-js";

import {
	Alert,
	attachContextMenu,
	Badge,
	Button,
	button,
	ConfirmDialog,
	Dialog,
	EmptyState,
	Field,
	Input,
	Menu,
	MoreIcon,
	notify,
	type PopoverControl,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Spinner,
	Stack,
	Switch,
	Segmented,
	Select,
	Textarea,
	Text,
	iconButton,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { SettingsPage } from "@/modules/settings";

import { skillsService } from "../services/skills.service";
import type { Skill, SkillProvider, SkillScope, SkillsView } from "../types/skill.types";

type Editor = "write" | "git" | "upload" | "edit";

function errorMessage(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

function scopeValue(scope: SkillScope): string {
	return scope.type === "workspace" ? "workspace" : `project:${scope.project}`;
}

function selectedScope(value: string): SkillScope {
	return value === "workspace"
		? { type: "workspace" }
		: { type: "project", project: value.slice("project:".length) };
}

function markdown(name: string, description: string, instructions: string): string {
	return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${instructions.trim()}\n`;
}

export function SkillsScreen(): JSX.Element {
	const auth = useAuth();
	const [view, setView] = createSignal<SkillsView | null>(null);
	const [loading, setLoading] = createSignal(true);
	const [loadError, setLoadError] = createSignal<string | null>(null);
	const [saving, setSaving] = createSignal(false);
	const [editor, setEditor] = createSignal<Editor | null>(null);
	const [editing, setEditing] = createSignal<Skill | null>(null);
	const [removing, setRemoving] = createSignal<Skill | null>(null);
	const [scope, setScope] = createSignal("workspace");
	const [name, setName] = createSignal("");
	const [description, setDescription] = createSignal("");
	const [instructions, setInstructions] = createSignal("");
	const [skillMarkdown, setSkillMarkdown] = createSignal("");
	const [gitUrl, setGitUrl] = createSignal("");
	const [folderPath, setFolderPath] = createSignal("");
	const [folderFiles, setFolderFiles] = createSignal<File[]>([]);
	const [archiveFile, setArchiveFile] = createSignal<File | null>(null);
	const [editorError, setEditorError] = createSignal<string | null>(null);
	const [busySkill, setBusySkill] = createSignal<string | null>(null);
	let folderInput: HTMLInputElement | undefined;

	async function load(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setLoading(true);
		try {
			setView(await skillsService.view(token));
			setLoadError(null);
		} catch (cause) {
			setLoadError(errorMessage(cause, "Could not load skills"));
			setView(null);
		} finally {
			setLoading(false);
		}
	}

	onSettled(() => void load());

	const workspaceSkills = createMemo(
		() => view()?.skills.filter((skill) => skill.scope.type === "workspace") ?? [],
	);
	const projectGroups = createMemo(() => {
		const skills = view()?.skills.filter((skill) => skill.scope.type === "project") ?? [];
		return (view()?.projects ?? []).flatMap((project) => {
			const rows = skills.filter(
				(skill) => skill.scope.type === "project" && skill.scope.project === project,
			);
			return rows.length ? [{ project, skills: rows }] : [];
		});
	});
	const providers = (): SkillProvider[] => view()?.providers ?? [];
	const providerNames = () =>
		providers()
			.map((provider) => provider.name)
			.join(", ") || "No agents are registered";
	const projectOptions = () =>
		(view()?.projects ?? []).map((project) => ({ value: `project:${project}`, label: project }));
	const scopeGroups = () => [
		{
			label: "Apply to",
			options: [
				{
					value: "workspace",
					label: "Whole workspace",
					description: "Every project in this workspace",
				},
				...projectOptions(),
			],
		},
	];

	function openEditor(mode: Exclude<Editor, "edit">): void {
		setEditing(null);
		setEditor(mode);
		setEditorError(null);
		setScope("workspace");
		setName("");
		setDescription("");
		setInstructions("");
		setSkillMarkdown("");
		setGitUrl("");
		setFolderPath("");
		setFolderFiles([]);
		setArchiveFile(null);
	}

	function openEdit(skill: Skill): void {
		setEditing(skill);
		setEditor("edit");
		setEditorError(null);
		setScope(scopeValue(skill.scope));
		setSkillMarkdown(skill.skillMarkdown);
	}

	async function submit(): Promise<void> {
		const token = auth.token();
		const mode = editor();
		if (!token || !mode || saving()) return;
		setSaving(true);
		setEditorError(null);
		try {
			const selected = selectedScope(scope());
			if (mode === "write") {
				await skillsService.write(token, {
					skillMarkdown: markdown(name(), description(), instructions()),
					scope: selected,
				});
			} else if (mode === "git") {
				await skillsService.fromGit(token, {
					url: gitUrl().trim(),
					...(folderPath().trim() ? { path: folderPath().trim() } : {}),
					scope: selected,
				});
			} else if (mode === "upload") {
				const archive = archiveFile();
				if (archive)
					await skillsService.uploadArchive(token, archive, selected, folderPath().trim());
				else {
					const files = folderFiles();
					await skillsService.uploadFolder(token, {
						files,
						paths: files.map((file) => file.webkitRelativePath || file.name),
						scope: selected,
					});
				}
			} else {
				const skill = editing();
				if (!skill) return;
				await skillsService.update(token, skill.id, {
					skillMarkdown: skillMarkdown(),
					files: skill.files,
					scope: selected,
				});
			}
			setEditor(null);
			notify({ title: mode === "edit" ? "Skill saved" : "Skill added", tone: "success" });
			await load();
		} catch (cause) {
			setEditorError(errorMessage(cause, "The skill could not be saved"));
		} finally {
			setSaving(false);
		}
	}

	async function toggle(skill: Skill, enabled: boolean): Promise<void> {
		const token = auth.token();
		if (!token || busySkill()) return;
		setBusySkill(skill.id);
		try {
			const changed = await skillsService.update(token, skill.id, { enabled });
			setView((current) =>
				current
					? {
							...current,
							skills: current.skills.map((item) => (item.id === changed.id ? changed : item)),
						}
					: current,
			);
		} catch (cause) {
			notify({
				title: "Skill not changed",
				description: errorMessage(cause, "Try again"),
				tone: "danger",
			});
		} finally {
			setBusySkill(null);
		}
	}

	async function removeSkill(): Promise<void> {
		const token = auth.token();
		const skill = removing();
		if (!token || !skill) return;
		setBusySkill(skill.id);
		try {
			await skillsService.remove(token, skill.id);
			setRemoving(null);
			notify({ title: `${skill.name} removed`, tone: "success" });
			await load();
		} catch (cause) {
			notify({
				title: "Skill not removed",
				description: errorMessage(cause, "Try again"),
				tone: "danger",
			});
		} finally {
			setBusySkill(null);
		}
	}

	function row(skill: Skill): JSX.Element {
		const source = skill.source.label;
		const scopeName = skill.scope.type === "workspace" ? "Whole workspace" : skill.scope.project;
		const actions = [
			{ id: "edit", label: "Edit skill" },
			{ id: "remove", label: "Remove skill", danger: true },
		];
		let menu: PopoverControl | undefined;
		return (
			// Right-click on desktop and a long press on touch open the row's menu; its ⋯ is drawn
			// only on hover or focus with a pointer, never at rest and never on touch.
			<div
				class="group/skill"
				ref={(el) => {
					const stop = attachContextMenu(el, (point) => menu?.open(point));
					onCleanup(stop);
				}}
			>
				<SettingsRow
					inline
					label={
						<span class="flex flex-wrap items-center gap-2">
							{skill.name}
							<Show when={!skill.enabled}>
								<Badge>Off</Badge>
							</Show>
						</span>
					}
					description={
						<span class="flex flex-col gap-0.5">
							<span>{skill.description}</span>
							<span class="text-fg-faint">
								{scopeName} · {source} · Sent to {providerNames()}
							</span>
						</span>
					}
				>
					<Show when={view()?.canManage} fallback={<Badge>View only</Badge>}>
						<Switch
							label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
							checked={skill.enabled}
							disabled={busySkill() !== null}
							onChange={(enabled) => void toggle(skill, enabled)}
						/>
						<Menu
							label={`Actions for ${skill.name}`}
							trigger={<MoreIcon />}
							triggerClass={`${iconButton({ size: "sm" })} opacity-0 group-hover/skill:opacity-100 focus-visible:opacity-100`}
							placement="bottom-end"
							pointerOnly
							control={(control) => {
								menu = control;
							}}
							groups={[{ items: actions }]}
							onSelect={(id) => {
								if (id === "edit") openEdit(skill);
								else setRemoving(skill);
							}}
						/>
					</Show>
				</SettingsRow>
			</div>
		);
	}

	return (
		<SettingsPage
			title="Skills"
			description="Keep reusable instructions in one place and choose the workspace or project that uses each one."
			actions={
				<Button
					size="sm"
					variant="primary"
					disabled={!view()?.canManage}
					onClick={() => openEditor("write")}
				>
					Add skill
				</Button>
			}
		>
			<Stack gap={4}>
				<Show when={view() && !view()?.canManage}>
					<Alert tone="warning" title="Your role can view skills but cannot change them." />
				</Show>
				<SettingsGroup
					title="Agent delivery"
					description="These agents are told which skills are on for a thread, and read one when it applies."
				>
					<SettingsRow
						label="How skills reach agents"
						description="Each thread gets a short list of its skills once, and again when the list changes. An agent opens a skill's SKILL.md only when it needs it."
					>
						<div class="flex flex-wrap justify-end gap-1.5">
							<For each={providers()}>
								{(provider) => (
									<Badge tone={provider.available ? "success" : "neutral"}>
										{provider.name}
										{provider.available ? "" : " · not installed"}
									</Badge>
								)}
							</For>
						</div>
					</SettingsRow>
				</SettingsGroup>

				<Show
					when={!loading()}
					fallback={
						<Stack gap={2}>
							<Skeleton class="h-14" />
							<Skeleton class="h-14" />
						</Stack>
					}
				>
					<Show
						when={(view()?.skills.length ?? 0) > 0}
						fallback={
							<Show
								when={loadError()}
								fallback={
									<EmptyState
										title="No skills yet"
										description="Add a skill from a public GitHub repository, an uploaded folder or ZIP, or write one here."
										action={
											<Button disabled={!view()?.canManage} onClick={() => openEditor("write")}>
												Write a skill
											</Button>
										}
									/>
								}
							>
								<EmptyState
									title="Skills could not be loaded"
									description={loadError() ?? "The runner did not return the skill list."}
									action={<Button onClick={() => void load()}>Try again</Button>}
								/>
							</Show>
						}
					>
						<Stack gap={4}>
							<Show when={workspaceSkills().length > 0}>
								<SettingsGroup
									title="Whole workspace"
									description="These skills are available in every project."
								>
									<For each={workspaceSkills()}>{(skill) => row(skill)}</For>
								</SettingsGroup>
							</Show>
							<For each={projectGroups()}>
								{(group) => (
									<SettingsGroup
										title={group.project}
										description="Only chats in this project receive these skills."
									>
										<For each={group.skills}>{(skill) => row(skill)}</For>
									</SettingsGroup>
								)}
							</For>
						</Stack>
					</Show>
				</Show>
			</Stack>

			<Dialog
				open={editor() !== null}
				onClose={() => setEditor(null)}
				title={editor() === "edit" ? `Edit ${editing()?.name ?? "skill"}` : "Add a skill"}
				description="A skill is a SKILL.md file with a name, description and instructions."
				width="38rem"
				footer={
					<>
						<Button variant="secondary" disabled={saving()} onClick={() => setEditor(null)}>
							Cancel
						</Button>
						<Button variant="primary" disabled={saving()} onClick={() => void submit()}>
							<Show when={saving()} fallback={editor() === "edit" ? "Save changes" : "Add skill"}>
								<Spinner /> Saving…
							</Show>
						</Button>
					</>
				}
			>
				<Stack gap={4}>
					<Show when={editor() !== "edit"}>
						<Segmented
							label="How to add the skill"
							block
							options={[
								{ value: "write", label: "Write" },
								{ value: "git", label: "Git URL" },
								{ value: "upload", label: "Upload" },
							]}
							value={
								editor() === "git" || editor() === "upload"
									? (editor() as "git" | "upload")
									: "write"
							}
							onChange={(value) => setEditor(value as Editor)}
						/>
					</Show>
					<Show when={editor() === "write"}>
						<Field
							label="Name"
							hint="Lowercase letters, numbers and single hyphens; for example, review-prs."
						>
							{(id) => (
								<Input
									id={id}
									maxlength={64}
									value={name()}
									onInput={(event) => setName(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field label="Description">
							{(id) => (
								<Input
									id={id}
									maxlength={300}
									value={description()}
									onInput={(event) => setDescription(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field
							label="Instructions"
							hint="Write concise guidance. You can edit the complete SKILL.md later."
						>
							{(id) => (
								<Textarea
									id={id}
									rows={9}
									value={instructions()}
									onInput={(event) => setInstructions(event.currentTarget.value)}
								/>
							)}
						</Field>
					</Show>
					<Show when={editor() === "edit"}>
						<Field
							label="SKILL.md"
							hint="Edit the frontmatter and instructions. Extra imported files stay with this skill."
						>
							{(id) => (
								<Textarea
									id={id}
									rows={15}
									value={skillMarkdown()}
									onInput={(event) => setSkillMarkdown(event.currentTarget.value)}
								/>
							)}
						</Field>
					</Show>
					<Show when={editor() === "git"}>
						<Field
							label="Public GitHub URL"
							hint="Grid reads a repository archive; it does not run repository code."
						>
							{(id) => (
								<Input
									id={id}
									type="url"
									placeholder="https://github.com/team/skill"
									value={gitUrl()}
									onInput={(event) => setGitUrl(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field
							label="Skill folder in repository"
							hint="Optional. Leave blank when the archive contains one SKILL.md."
						>
							{(id) => (
								<Input
									id={id}
									value={folderPath()}
									onInput={(event) => setFolderPath(event.currentTarget.value)}
								/>
							)}
						</Field>
					</Show>
					<Show when={editor() === "upload"}>
						<Field label="Skill folder">
							{(id) => (
								<div class="flex flex-wrap items-center gap-2">
									<Input
										ref={(element) => {
											folderInput = element;
											element.setAttribute("webkitdirectory", "");
										}}
										id={id}
										type="file"
										multiple
										accept="text/*"
										class="sr-only"
										onChange={(event) => {
											setArchiveFile(null);
											setFolderFiles(Array.from(event.currentTarget.files ?? []));
										}}
									/>
									<Button variant="secondary" onClick={() => folderInput?.click()}>
										Choose folder
									</Button>
									<Text size="caption" tone="subtle">
										{folderFiles().length
											? `${folderFiles().length} files selected`
											: "Includes SKILL.md and optional files"}
									</Text>
								</div>
							)}
						</Field>
						<Field label="ZIP file">
							{(id) => (
								<div class="flex flex-wrap items-center gap-2">
									<label class={button({ size: "sm" })}>
										<input
											id={id}
											type="file"
											accept=".zip,application/zip"
											class="sr-only"
											onChange={(event) => {
												setFolderFiles([]);
												setArchiveFile(event.currentTarget.files?.[0] ?? null);
											}}
										/>
										Choose ZIP
									</label>
									<Text size="caption" tone="subtle">
										{archiveFile()?.name ?? "One skill per ZIP file"}
									</Text>
								</div>
							)}
						</Field>
						<Show when={archiveFile()}>
							<Field label="Folder in ZIP" hint="Optional when the ZIP contains one skill.">
								{(id) => (
									<Input
										id={id}
										value={folderPath()}
										onInput={(event) => setFolderPath(event.currentTarget.value)}
									/>
								)}
							</Field>
						</Show>
					</Show>
					<Field label="Scope" hint="A project skill applies only to chats in that project.">
						{(id) => (
							<div id={id}>
								<Select
									label="Skill scope"
									value={scope()}
									onChange={setScope}
									groups={scopeGroups()}
									look="field"
								/>
							</div>
						)}
					</Field>
					<Show when={editorError()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				</Stack>
			</Dialog>

			<ConfirmDialog
				open={removing() !== null}
				onClose={() => setRemoving(null)}
				onConfirm={() => void removeSkill()}
				title={`Remove ${removing()?.name ?? "this skill"}?`}
				description="Chats will stop receiving this skill. Its stored files will be removed from this runner."
				confirm="Remove skill"
				danger
			/>
		</SettingsPage>
	);
}
