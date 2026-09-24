import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, Match, Show, Switch } from "solid-js";

import { useAuth } from "@/modules/auth";
import { Button, CloseIcon, ErrorNotice, Field, FolderIcon, IconButton, Input, Sheet } from "@/ui";

import { useWorkspace } from "../context/workspace-context";
import { slugify } from "../lib/slug";
import { foldersService } from "../services/folders.service";
import { projectsService } from "../services/projects.service";

import { FolderBrowser } from "./folder-browser";

function SheetHeader(props: { title: string; onClose: () => void }): JSX.Element {
	return (
		<header class="flex shrink-0 items-center gap-2 border-stroke border-b px-4 py-2.5">
			<h2 class="min-w-0 flex-1 truncate font-semibold text-ui">{props.title}</h2>
			<IconButton label="Close" onClick={props.onClose}>
				<CloseIcon />
			</IconButton>
		</header>
	);
}

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

	function close(): void {
		workspace.setAddProjectOpen(false);
		setFolder(null);
		setError(null);
		setSlugEdited(false);
	}

	async function pick(path: string): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setError(null);
		try {
			const details = await foldersService.inspect(token, path);
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
			await foldersService.link(token, project.slug, path);
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
		<Sheet placement="panel" open={workspace.addProjectOpen()} onClose={close} label="Add project">
			<div class="flex h-full flex-col">
				<SheetHeader
					title={folder() ? "Add project" : "Choose the project's folder"}
					onClose={close}
				/>
				<div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
					<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>
					<Switch>
						<Match when={!folder()}>
							<p class="text-ink/55 text-ui-sm">
								The folder with the project's code, on the machine Grid runs on.
							</p>
							<FolderBrowser actionLabel="Use" onPick={(path) => void pick(path)} />
						</Match>
						<Match when={folder()}>
							{(path) => (
								<form class="flex flex-col gap-4" onSubmit={(event) => void create(event)}>
									<p class="flex items-center gap-2 rounded-lg bg-ink/5 px-3 py-2 font-mono text-ink/70 text-ui-xs">
										<FolderIcon class="size-4 shrink-0" />
										<span class="min-w-0 flex-1 truncate">{path()}</span>
										<button
											type="button"
											class="focus-ring shrink-0 font-sans text-link text-ui-xs underline-offset-2 hover:underline"
											onClick={() => setFolder(null)}
										>
											Change
										</button>
									</p>
									<Field label="Name">
										<Input
											value={name()}
											required
											maxlength={120}
											onInput={(event) => {
												setName(event.currentTarget.value);
												if (!slugEdited()) setSlug(slugify(event.currentTarget.value));
											}}
										/>
									</Field>
									<Field
										label="Short name"
										hint="Used in links: lowercase letters, numbers and dashes."
									>
										<Input
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
									</Field>
									<Field label="Repository" hint="Read from the folder's git remote; optional.">
										<Input
											type="url"
											value={repoUrl()}
											placeholder="https://github.com/you/project"
											autocapitalize="off"
											spellcheck={false}
											onInput={(event) => setRepoUrl(event.currentTarget.value)}
										/>
									</Field>
									<Button
										type="submit"
										variant="primary"
										size="lg"
										disabled={saving() || !name().trim() || slug().length < 2}
									>
										{saving() ? "Adding…" : "Add project"}
									</Button>
								</form>
							)}
						</Match>
					</Switch>
				</div>
			</div>
		</Sheet>
	);
}

/** Link an existing project to its folder on this machine. */
export function ChooseFolderSheet(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const [error, setError] = createSignal<string | null>(null);
	const project = () =>
		workspace.projects().find((item) => item.slug === workspace.choosingFolderFor());

	function close(): void {
		workspace.chooseFolderFor(null);
		setError(null);
	}

	async function link(path: string): Promise<void> {
		const token = auth.token();
		const slug = workspace.choosingFolderFor();
		if (!token || !slug) return;
		try {
			await foldersService.link(token, slug, path);
			workspace.refreshFolders();
			close();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not link that folder");
		}
	}

	return (
		<Sheet
			placement="panel"
			open={workspace.choosingFolderFor() !== null}
			onClose={close}
			label="Choose folder"
		>
			<div class="flex h-full flex-col">
				<SheetHeader title={`Folder for ${project()?.name ?? "this project"}`} onClose={close} />
				<div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
					<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>
					<Show when={workspace.choosingFolderFor()}>
						<FolderBrowser
							start={workspace.folders()[workspace.choosingFolderFor() ?? ""]}
							actionLabel="Use"
							onPick={(path) => void link(path)}
						/>
					</Show>
				</div>
			</div>
		</Sheet>
	);
}
