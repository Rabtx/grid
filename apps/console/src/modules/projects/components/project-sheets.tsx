import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Match, Show, Switch } from "solid-js";

import {
	Alert,
	Button,
	ColorSwatches,
	ConfirmDialog,
	Dialog,
	Disclosure,
	Field,
	FolderIcon,
	GlyphChoices,
	Icon,
	Input,
	LinkButton,
	Row,
	Segmented,
	Stack,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { MachinePicker, placementsStore, scopeFor } from "@/modules/environments";

import { useWorkspace } from "../context/workspace-context";
import {
	PROJECT_COLORS,
	PROJECT_MASCOTS,
	PROJECT_SYMBOLS,
	projectColor,
} from "../lib/project-look";
import { slugify } from "../lib/slug";
import { foldersService } from "../services/folders.service";
import { projectsService } from "../services/projects.service";

import { FolderBrowser } from "./folder-browser";
import { Mascot, ProjectIcon, SYMBOL_ICONS } from "./project-icon";

/**
 * Add a project from a folder on this machine: pick the folder, then check the name and
 * repository Grid read from it. Creates the project and links it to the folder, so chats and
 * terminals for it start there.
 */
export function AddProjectSheet(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const [folder, setFolder] = createSignal<string | null>(null);
	const [name, setName] = createSignal("");
	const [slug, setSlug] = createSignal("");
	const [slugEdited, setSlugEdited] = createSignal(false);
	const [repoUrl, setRepoUrl] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [saving, setSaving] = createSignal(false);
	// The machine the folder is on, and so where the project runs: this one unless picked.
	const [machine, setMachine] = createSignal<string | null>(null);

	function close(): void {
		workspace.setAddProjectOpen(false);
		setFolder(null);
		setError(null);
		setSlugEdited(false);
		setMachine(null);
	}

	// A short name no other project uses: `app`, then `app-2`, `app-3`…
	function uniqueSlug(name: string): string {
		const taken = new Set(workspace.projects().map((project) => project.slug));
		const base = slugify(name) || "project";
		let slug = base;
		for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
		return slug;
	}

	async function pick(path: string): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setError(null);
		try {
			const details = await foldersService.inspect(token, path, scopeFor(machine()));
			setFolder(details.path);
			setName(details.name);
			setSlug(slugify(details.name));
			setRepoUrl(details.repoUrl ?? "");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not read that folder");
		}
	}

	async function create(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const token = auth.token();
		const path = folder();
		if (!token || !path || saving()) return;
		setSaving(true);
		setError(null);
		try {
			const project = await projectsService.create(token, {
				slug: slug(),
				name: name().trim(),
				repoUrl: repoUrl().trim() || null,
			});
			await foldersService.link(token, project.slug, path, scopeFor(machine()));
			await placementsStore.place(token, project.slug, machine());
			workspace.refreshProjects();
			workspace.refreshFolders();
			close();
			navigate(`/chat/${project.slug}`);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not add the project");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog
			kind="drawer"
			width="30rem"
			open={workspace.addProjectOpen()}
			onClose={close}
			title={folder() ? "Add project" : "Choose the project's folder"}
		>
			<Stack gap={3} class="h-full min-h-0">
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Switch>
					<Match when={!folder()}>
						<Text tone="subtle">
							The folder with the project's code. The project runs on the machine it is on: its
							chats, agents, files and terminals.
						</Text>
						<MachinePicker value={machine()} onChange={setMachine} />
						{/* Mounted only while open, and again per machine: it lists folders on mount. */}
						<Show when={workspace.addProjectOpen()}>
							<For each={[scopeFor(machine())]}>
								{(scope) => (
									<FolderBrowser
										scope={scope}
										actionLabel="Use"
										onPick={(path) => void pick(path)}
									/>
								)}
							</For>
						</Show>
					</Match>
					<Match when={folder()}>
						{(path) => (
							<form onSubmit={(event) => void create(event)}>
								<Stack gap={4}>
									<div class="surface-well flex min-w-0 items-center gap-2 px-3 py-2">
										<FolderIcon size="sm" class="text-fg-subtle" />
										<Text as="span" size="caption" tone="default" mono truncate class="flex-1">
											{path()}
										</Text>
										<LinkButton tone="accent" onClick={() => setFolder(null)}>
											Change
										</LinkButton>
									</div>
									<Field label="Name">
										{(id) => (
											<Input
												id={id}
												value={name()}
												required
												maxlength={120}
												onInput={(event) => {
													setName(event.currentTarget.value);
													if (!slugEdited()) setSlug(uniqueSlug(event.currentTarget.value));
												}}
											/>
										)}
									</Field>
									{/* The name is all most projects need; the rest is filled in from the folder. */}
									<Disclosure
										summary={
											<>
												More: short name <span class="font-mono">{slug()}</span>
												{repoUrl() ? " · repository" : ""}
											</>
										}
									>
										<Stack gap={4} class="pt-2">
											<Field
												label="Short name"
												hint="Used in links: lowercase letters, numbers and dashes."
											>
												{(id) => (
													<Input
														id={id}
														value={slug()}
														required
														minlength={2}
														maxlength={64}
														pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
														autocapitalize="off"
														spellcheck={false}
														class="font-mono"
														onInput={(event) => {
															setSlugEdited(true);
															setSlug(event.currentTarget.value.toLowerCase());
														}}
													/>
												)}
											</Field>
											<Field label="Repository" hint="Read from the folder's git remote; optional.">
												{(id) => (
													<Input
														id={id}
														type="url"
														value={repoUrl()}
														placeholder="https://github.com/you/project"
														autocapitalize="off"
														spellcheck={false}
														onInput={(event) => setRepoUrl(event.currentTarget.value)}
													/>
												)}
											</Field>
										</Stack>
									</Disclosure>
									<Button
										type="submit"
										variant="primary"
										size="lg"
										disabled={saving() || !name().trim() || slug().length < 2}
									>
										{saving() ? "Adding…" : "Add project"}
									</Button>
								</Stack>
							</form>
						)}
					</Match>
				</Switch>
			</Stack>
		</Dialog>
	);
}

/**
 * Link an existing project to its folder, on this machine or an environment. Choosing a folder
 * on an environment moves the project there: its chats, agents, files and terminals follow.
 */
export function ChooseFolderSheet(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const [error, setError] = createSignal<string | null>(null);
	const [machine, setMachine] = createSignal<string | null>(null);
	const project = () =>
		workspace.projects().find((item) => item.slug === workspace.choosingFolderFor());

	// Open on the machine the project runs on now.
	createEffect(
		() => workspace.choosingFolderFor(),
		(slug) => {
			if (slug) setMachine(placementsStore.environmentOf(slug));
		},
	);

	function close(): void {
		workspace.chooseFolderFor(null);
		setError(null);
	}

	async function link(path: string): Promise<void> {
		const token = auth.token();
		const slug = workspace.choosingFolderFor();
		if (!token || !slug) return;
		try {
			await foldersService.link(token, slug, path, scopeFor(machine()));
			await placementsStore.place(token, slug, machine());
			workspace.refreshFolders();
			close();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not link that folder");
		}
	}

	return (
		<Dialog
			kind="drawer"
			width="30rem"
			open={workspace.choosingFolderFor() !== null}
			onClose={close}
			title={`Folder for ${project()?.name ?? "this project"}`}
		>
			<Stack gap={3} class="h-full min-h-0">
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<MachinePicker value={machine()} onChange={setMachine} />
				<Show when={workspace.choosingFolderFor()}>
					<For each={[scopeFor(machine())]}>
						{(scope) => (
							<FolderBrowser
								scope={scope}
								start={
									machine() === placementsStore.environmentOf(workspace.choosingFolderFor())
										? workspace.folders()[workspace.choosingFolderFor() ?? ""]
										: undefined
								}
								actionLabel="Use"
								onPick={(path) => void link(path)}
							/>
						)}
					</For>
				</Show>
			</Stack>
		</Dialog>
	);
}

/** Rename a project, or remove it from the console; both from the project's menu. */
export function ProjectActionDialogs(): JSX.Element {
	const workspace = useWorkspace();
	const [name, setName] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);
	const action = () => workspace.projectAction();
	const project = () => workspace.projects().find((item) => item.slug === action()?.slug);

	// Start from the current name each time the rename sheet opens.
	createEffect(
		() => (action()?.kind === "rename" ? (project()?.name ?? "") : null),
		(current) => {
			if (current !== null) setName(current);
		},
	);

	function close(): void {
		workspace.setProjectAction(null);
		setError(null);
		setPending(false);
	}

	async function run(work: () => Promise<void>): Promise<void> {
		setPending(true);
		setError(null);
		try {
			await work();
			close();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not update the project");
			setPending(false);
		}
	}

	return (
		<>
			<Dialog
				open={action()?.kind === "rename"}
				onClose={close}
				title="Rename project"
				width="26rem"
				footer={
					<>
						<Button variant="ghost" onClick={close}>
							Cancel
						</Button>
						<Button
							type="submit"
							form="rename-project-form"
							variant="primary"
							disabled={pending() || !name().trim()}
						>
							{pending() ? "Saving…" : "Save"}
						</Button>
					</>
				}
			>
				<form
					id="rename-project-form"
					onSubmit={(event) => {
						event.preventDefault();
						const slug = action()?.slug;
						const next = name().trim();
						if (slug && next) void run(() => workspace.renameProject(slug, next));
					}}
				>
					<Stack gap={4}>
						<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
						<Field label="Name">
							{(id) => (
								<Input
									id={id}
									value={name()}
									required
									maxlength={120}
									onInput={(event) => setName(event.currentTarget.value)}
								/>
							)}
						</Field>
					</Stack>
				</form>
			</Dialog>
			<ConfirmDialog
				open={action()?.kind === "remove"}
				title={`Remove ${project()?.name ?? "this project"}?`}
				description={`It leaves Grid; the folder on this machine and its chats stay as they are.${error() ? ` ${error()}` : ""}`}
				confirm="Remove"
				danger
				pending={pending()}
				stayOpen
				onConfirm={() => {
					const slug = action()?.slug;
					if (slug) void run(() => workspace.removeProject(slug));
				}}
				onClose={close}
			/>
		</>
	);
}

type LookTab = "symbols" | "mascots" | "simple";

/** Choose how a project is drawn: its colour and its icon, with a live, working preview. */
export function ProjectLookSheet(): JSX.Element {
	const workspace = useWorkspace();
	const [icon, setIcon] = createSignal<string | null>(null);
	const [color, setColor] = createSignal<string | null>(null);
	const [tab, setTab] = createSignal<LookTab>("symbols");
	const [error, setError] = createSignal<string | null>(null);
	const [pending, setPending] = createSignal(false);
	const action = () => workspace.projectAction();
	const project = () => workspace.projects().find((item) => item.slug === action()?.slug);
	const open = () => action()?.kind === "customize";

	// Start from the project's current look each time the sheet opens.
	createEffect(
		() => (open() ? (project() ?? null) : null),
		(current) => {
			if (!current) return;
			setIcon(current.icon ?? null);
			setColor(current.color ?? null);
			setTab(
				current.icon?.startsWith("mascot:")
					? "mascots"
					: current.icon?.startsWith("symbol:") || !current.icon
						? "symbols"
						: "simple",
			);
			setError(null);
		},
	);

	const preview = () => ({
		slug: project()?.slug ?? "project",
		name: project()?.name ?? "Project",
		icon: icon(),
		color: color(),
	});

	function close(): void {
		workspace.setProjectAction(null);
		setPending(false);
	}

	async function save(): Promise<void> {
		const slug = action()?.slug;
		if (!slug) return;
		setPending(true);
		setError(null);
		try {
			await workspace.styleProject(slug, { icon: icon(), color: color() });
			close();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not save the project's look");
			setPending(false);
		}
	}

	return (
		<Dialog
			open={open()}
			onClose={close}
			title="Customize project"
			width="30rem"
			footer={
				<>
					<Button variant="ghost" onClick={close}>
						Cancel
					</Button>
					<Button variant="primary" disabled={pending()} onClick={() => void save()}>
						{pending() ? "Saving…" : "Save"}
					</Button>
				</>
			}
		>
			<Stack gap={5}>
				<Row gap={3}>
					<div class="surface-well grid size-12 shrink-0 place-items-center">
						<ProjectIcon project={preview()} running class="size-7" />
					</div>
					<div class="min-w-0">
						<Text tone="strong" weight="medium" truncate>
							{project()?.name ?? "Project"}
						</Text>
						<Text size="caption" tone="subtle">
							Shown moving while one of its threads works.
						</Text>
					</div>
				</Row>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>

				<ColorSwatches
					label="Colour"
					options={PROJECT_COLORS}
					value={color()}
					onChange={setColor}
				/>

				<Stack gap={2}>
					<Row gap={2} justify="between">
						<Text as="span" tone="strong" weight="medium">
							Icon
						</Text>
						<Segmented<LookTab>
							label="Icon kind"
							options={[
								{ value: "symbols", label: "Symbols" },
								{ value: "mascots", label: "Mascots" },
								{ value: "simple", label: "Simple" },
							]}
							value={tab()}
							onChange={setTab}
						/>
					</Row>
					<Switch>
						<Match when={tab() === "symbols"}>
							<GlyphChoices
								label="Symbols"
								color={projectColor(preview())}
								value={icon()}
								onChange={setIcon}
								options={PROJECT_SYMBOLS.map((id) => ({
									value: `symbol:${id}`,
									label: id,
									glyph: <Icon icon={SYMBOL_ICONS[id]} size="md" />,
								}))}
							/>
						</Match>
						<Match when={tab() === "mascots"}>
							<GlyphChoices
								label="Mascots"
								color={projectColor(preview())}
								value={icon()}
								onChange={setIcon}
								options={Object.keys(PROJECT_MASCOTS).map((id) => ({
									value: `mascot:${id}`,
									label: id,
									glyph: <Mascot id={id} busy={icon() === `mascot:${id}`} class="size-5" />,
								}))}
							/>
						</Match>
						<Match when={tab() === "simple"}>
							<GlyphChoices
								label="Simple"
								wide
								color={projectColor(preview())}
								value={icon() === null ? "folder" : icon()}
								onChange={(value) => setIcon(value === "folder" ? null : value)}
								options={[
									{ value: "folder", label: "Folder", glyph: <FolderIcon size="sm" /> },
									{
										value: "letter",
										label: "Letter",
										glyph: <ProjectIcon project={{ ...preview(), icon: "letter" }} />,
									},
								]}
							/>
						</Match>
					</Switch>
				</Stack>
			</Stack>
		</Dialog>
	);
}
