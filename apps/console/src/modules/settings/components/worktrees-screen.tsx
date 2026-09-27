import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";

import {
	Alert,
	Badge,
	Button,
	EmptyState,
	BranchIcon,
	notify,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Stack,
	Text,
	TextLink,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import {
	type RemoveOptions,
	RemoveWorktreeDialog,
} from "@/modules/chat/components/remove-worktree-dialog";
import { gitService, type WorktreeEntry } from "@/modules/chat/services/git.service";
import { threadsStore } from "@/modules/chat/stores/threads";
import { useWorkspace } from "@/modules/projects";

import { SettingsPage } from "./settings-page";

/** How a worktree stands, as one badge: what removing it would throw away. */
function standing(entry: WorktreeEntry): { label: string; tone: "neutral" | "warning" | "danger" } {
	if (!entry.exists) return { label: "Missing on disk", tone: "danger" };
	if (entry.changed > 0) return { label: `${entry.changed} uncommitted`, tone: "warning" };
	if (entry.unpushed > 0) return { label: `${entry.unpushed} unpushed`, tone: "warning" };
	return { label: "Nothing to lose", tone: "neutral" };
}

/**
 * Settings → Worktrees: every separate checkout threads work in, on this machine, grouped by
 * project: which branch, which thread (or none, when its thread was deleted while it held work),
 * and what removing it would lose. Worktrees that hold nothing can be cleaned up in one go.
 */
export function WorktreesScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const [entries, setEntries] = createSignal<WorktreeEntry[] | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [removing, setRemoving] = createSignal<WorktreeEntry | null>(null);
	const [removeError, setRemoveError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);

	async function load(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			setEntries(await gitService.worktrees(token));
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not read the worktrees");
			setEntries([]);
		}
	}

	onSettled(() => void load());

	const byProject = createMemo(() => {
		const groups = new Map<string, WorktreeEntry[]>();
		for (const entry of entries() ?? []) {
			groups.set(entry.project, [...(groups.get(entry.project) ?? []), entry]);
		}
		return [...groups];
	});
	const unused = () =>
		(entries() ?? []).filter((entry) => entry.changed === 0 && entry.unpushed === 0).length;
	const projectName = (slug: string) =>
		workspace.projects().find((project) => project.slug === slug)?.name ?? slug;

	/** Threads whose worktree went now work in their folder: the thread list reads them again. */
	async function refreshThreads(projects: string[]): Promise<void> {
		const token = auth.token();
		if (!token) return;
		await Promise.all([...new Set(projects)].map((project) => threadsStore.reload(token, project)));
	}

	async function clean(): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		try {
			const { removed } = await gitService.cleanWorktrees(token);
			notify({
				title: `Removed ${removed} unused worktree${removed === 1 ? "" : "s"}`,
				tone: "success",
			});
			await refreshThreads((entries() ?? []).map((entry) => entry.project));
			await load();
		} catch (cause) {
			notify({ title: cause instanceof Error ? cause.message : "Not cleaned up", tone: "danger" });
		} finally {
			setBusy(false);
		}
	}

	async function remove(options: RemoveOptions): Promise<void> {
		const token = auth.token();
		const entry = removing();
		if (!token || !entry) return;
		setBusy(true);
		setRemoveError(null);
		try {
			await gitService.removeWorktree(token, entry.path, options);
			setRemoving(null);
			await refreshThreads([entry.project]);
			await load();
		} catch (cause) {
			setRemoveError(cause instanceof Error ? cause.message : "Could not remove it");
		} finally {
			setBusy(false);
		}
	}

	return (
		<SettingsPage
			title="Worktrees"
			description="Separate checkouts threads work in, each on its own branch, on this machine."
			actions={
				<Button size="sm" disabled={busy() || unused() === 0} onClick={() => void clean()}>
					{unused() > 0 ? `Clean up ${unused()} unused` : "Nothing to clean up"}
				</Button>
			}
		>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<Show
				when={entries()}
				fallback={
					<Stack gap={2}>
						<Skeleton class="h-14" />
						<Skeleton class="h-14" />
					</Stack>
				}
			>
				{(loaded) => (
					<Show
						when={loaded().length > 0}
						fallback={
							<EmptyState
								icon={<BranchIcon size="md" />}
								title="No worktrees"
								description="Start a thread in a new worktree from the branch control under the message box."
							/>
						}
					>
						<For each={byProject()}>
							{([project, list]) => (
								<SettingsGroup title={projectName(project)}>
									<For each={list}>
										{(entry) => (
											<SettingsRow
												label={entry.branch}
												description={
													entry.chat
														? `Thread: ${entry.chat.title}`
														: "Its thread was deleted; kept because it held work"
												}
											>
												<Badge tone={standing(entry).tone}>{standing(entry).label}</Badge>
												<Show when={entry.chat}>
													{(chat) => (
														<TextLink
															tone="accent"
															href={workspaceHref(`/chat/${project}/${chat().id}`)}
														>
															Open
														</TextLink>
													)}
												</Show>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => {
														setRemoveError(null);
														setRemoving(entry);
													}}
												>
													Remove
												</Button>
											</SettingsRow>
										)}
									</For>
								</SettingsGroup>
							)}
						</For>
						<Text size="caption" tone="faint">
							Worktrees live in .grid-worktrees in your projects folder. Removing one keeps its
							branch unless you choose otherwise.
						</Text>
					</Show>
				)}
			</Show>
			<RemoveWorktreeDialog
				open={removing() !== null}
				status={removing()}
				description={
					removing()?.chat
						? "Its thread carries on in the project's own folder."
						: "Its thread is already gone."
				}
				pending={busy()}
				error={removeError()}
				onClose={() => setRemoving(null)}
				onRemove={(options) => void remove(options)}
			/>
		</SettingsPage>
	);
}
