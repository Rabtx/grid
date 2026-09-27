import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
	Alert,
	BranchIcon,
	CheckIcon,
	ChevronDownIcon,
	Input,
	linkButton,
	MENU_ITEM,
	PlusIcon,
	Popover,
	SearchIcon,
	SearchInput,
	Segmented,
	Stack,
	Text,
	TextLink,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";

import { type GitInfo, gitService } from "../services/git.service";

/** Where a new thread will work: the folder as it is, or a new worktree on a new branch. */
export type WorkPlace = { worktree: boolean; branch: string };

const PLACES = [
	{ value: "folder", label: "This folder" },
	{ value: "worktree", label: "New worktree" },
] as const;

/**
 * The git control under the composer, beside the folder: the branch the agent works on. Open it
 * to switch branch or create one in that folder; before a thread's first message it also offers
 * a new worktree instead, on a branch of its own, made when the message is sent. Folders outside
 * git show nothing.
 */
export function GitControl(props: {
	/** The folder the agent works in (the project's, or the thread's worktree). */
	folder: string;
	/** The runner the folder is on: "" for this machine, `/env/<id>` for another. */
	scope: string;
	/** A new thread: where it will work, chosen here. Without it, the thread already works in `folder`. */
	place?: WorkPlace;
	onPlace?: (place: WorkPlace) => void;
	/** The thread already works in a worktree of its own. */
	inWorktree?: boolean;
}): JSX.Element {
	const auth = useAuth();
	const [info, setInfo] = createSignal<GitInfo | null>(null);
	const [query, setQuery] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);

	async function load(): Promise<void> {
		const token = auth.token();
		const folder = props.folder;
		if (!token || !folder) return;
		try {
			const next = await gitService.info(token, folder, props.scope);
			if (folder === props.folder) setInfo(next);
		} catch {
			// No git control when the folder cannot be read; the folder line still shows.
			setInfo(null);
		}
	}

	createEffect(
		() => [auth.token(), props.folder, props.scope] as const,
		() => void load(),
	);

	const branches = createMemo(() => {
		const wanted = query().trim().toLowerCase();
		const all = info()?.branches ?? [];
		return wanted ? all.filter((branch) => branch.toLowerCase().includes(wanted)) : all;
	});
	const creatable = () => {
		const name = query().trim();
		return name && !(info()?.branches ?? []).includes(name) ? name : null;
	};
	const worktree = () => props.place?.worktree ?? false;

	async function choose(branch: string, create: boolean, close: () => void): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		setError(null);
		try {
			setInfo(await gitService.checkout(token, props.folder, branch, create, props.scope));
			setQuery("");
			close();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "git did not switch");
		} finally {
			setBusy(false);
		}
	}

	const label = () =>
		worktree() ? props.place?.branch.trim() || "New worktree" : (info()?.branch ?? "Detached");

	return (
		<Show when={info()?.repo}>
			<Popover
				label="Branch and worktree"
				placement="top-start"
				width="md:w-80"
				triggerClass={linkButton({
					tone: worktree() ? "accent" : "subtle",
					// The branch keeps its room; the folder path beside it is what truncates.
					class: "max-w-48 shrink-0",
				})}
				trigger={
					<>
						<BranchIcon size="sm" />
						<span class="min-w-0 truncate font-mono">{label()}</span>
						<Show when={(info()?.changed ?? 0) > 0 && !worktree()}>
							<span class="text-warning" title={`${info()?.changed} changed files`}>
								±{info()?.changed}
							</span>
						</Show>
						<ChevronDownIcon size="sm" />
					</>
				}
			>
				{(close) => (
					<Stack gap={2} class="p-2">
						<Show when={props.place}>
							{(place) => (
								<Segmented
									block
									label="Where the agent works"
									options={PLACES}
									value={place().worktree ? "worktree" : "folder"}
									onChange={(value) =>
										props.onPlace?.({ ...place(), worktree: value === "worktree" })
									}
								/>
							)}
						</Show>
						<Show
							when={worktree()}
							fallback={
								<>
									<SearchInput
										icon={<SearchIcon size="sm" />}
										aria-label="Find or create a branch"
										placeholder="Find or create a branch"
										value={query()}
										onInput={(event) => setQuery(event.currentTarget.value)}
										onKeyDown={(event) => {
											const name = creatable();
											if (event.key === "Enter" && name) void choose(name, true, close);
										}}
									/>
									<div class="flex max-h-64 flex-col overflow-y-auto">
										<For each={branches()}>
											{(branch) => (
												<button
													type="button"
													class={MENU_ITEM}
													disabled={busy()}
													onClick={() =>
														branch === info()?.branch ? close() : void choose(branch, false, close)
													}
												>
													<BranchIcon size="sm" />
													<span class="min-w-0 flex-1 truncate font-mono">{branch}</span>
													<Show when={branch === info()?.branch}>
														<CheckIcon size="sm" />
													</Show>
												</button>
											)}
										</For>
										<Show when={creatable()}>
											{(name) => (
												<button
													type="button"
													class={MENU_ITEM}
													disabled={busy()}
													onClick={() => void choose(name(), true, close)}
												>
													<PlusIcon size="sm" />
													<span class="min-w-0 flex-1 truncate">
														Create <span class="font-mono">{name()}</span>
													</span>
												</button>
											)}
										</Show>
									</div>
									<Text size="caption" tone="faint">
										{props.inWorktree
											? "Switches the branch in this thread's worktree."
											: "Switches the branch in the project's folder."}
									</Text>
								</>
							}
						>
							<Stack gap={1.5}>
								<Input
									aria-label="New branch"
									placeholder="Branch name (Grid picks one if empty)"
									value={props.place?.branch ?? ""}
									onInput={(event) =>
										props.onPlace?.({ worktree: true, branch: event.currentTarget.value })
									}
								/>
								<Text size="caption" tone="subtle">
									A separate checkout from {info()?.branch ?? "what is checked out"}, made when you
									send. Your folder stays as it is.
								</Text>
							</Stack>
						</Show>
						<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
						<div class="border-line border-t px-1 pt-2">
							<TextLink tone="subtle" href={workspaceHref("/settings/worktrees")}>
								Manage worktrees
							</TextLink>
						</div>
					</Stack>
				)}
			</Popover>
		</Show>
	);
}
