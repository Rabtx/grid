import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	Badge,
	Button,
	ConfirmDialog,
	Dialog,
	EmptyState,
	Field,
	IdeaIcon,
	PlusIcon,
	SearchIcon,
	SearchInput,
	Segmented,
	Select,
	ShipHeading,
	ShipPage,
	ShipRows,
	Skeleton,
	Stack,
	Text,
	Textarea,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { useWorkspaces } from "@/modules/workspaces";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type { Member } from "@/modules/workspaces/types/workspace.types";

import { relativeTime } from "../lib/relative-time";
import {
	MEMORY_KINDS,
	type MemoryEntry,
	type MemoryKind,
	memoryService,
} from "../services/memory.service";

type Filter = MemoryKind | "all";
type Draft = { id: string | null; kind: MemoryKind; text: string };

const KIND_TONE: Record<MemoryKind, "accent" | "success" | "warning" | "neutral"> = {
	decision: "accent",
	convention: "success",
	fix: "warning",
	fact: "neutral",
};

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * A project's memory: what its threads and people kept for later work, decisions, conventions,
 * the reasons behind fixes, facts that took finding out. Each new thread starts with the entries
 * its first message is about, and agents add to it as they work. Anyone here can add, correct or
 * search it; an entry is removed by whoever kept it or an admin.
 */
export function MemoryScreen(): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const navigate = useNavigate();
	const match = useMatch(() => "/memory/:slug");
	const slug = () => match()?.params.slug ?? "";
	const [entries, setEntries] = createSignal<MemoryEntry[] | null>(null);
	const [members, setMembers] = createSignal<Member[]>([]);
	const [query, setQuery] = createSignal("");
	const [filter, setFilter] = createSignal<Filter>("all");
	const [error, setError] = createSignal<string | null>(null);
	const [draft, setDraft] = createSignal<Draft | null>(null);
	const [removing, setRemoving] = createSignal<MemoryEntry | null>(null);
	const [busy, setBusy] = createSignal(false);

	let asked = 0;
	/** Read the entries again: from an effect with what it tracks, else with what is shown now. */
	async function load(token = auth.token(), project = slug(), words = query()): Promise<void> {
		if (!token || !project) return;
		const ask = ++asked;
		try {
			const found = await memoryService.list(token, project, words);
			if (ask !== asked) return;
			setEntries(found);
			setError(null);
		} catch (cause) {
			if (ask === asked) setError(message(cause, "Could not read this project's memory"));
		}
	}

	createEffect(
		() => [auth.token(), slug(), query()] as const,
		([token, project, words]) => {
			if (token && project) void load(token, project, words);
		},
	);
	createEffect(
		() => [auth.token(), workspaces.current()?.slug] as const,
		([token, workspace]) => {
			if (!token || !workspace) return;
			void workspacesService.members(token, workspace).then(setMembers, (cause: unknown) => {
				console.warn("[memory] could not read the members:", cause);
			});
		},
	);

	const whose = (entry: MemoryEntry) => {
		if (entry.by.kind === "agent") return entry.by.name;
		const member = members().find((item) => item.userId === entry.by.id);
		return member?.displayName || member?.username || entry.by.name;
	};
	const shown = () =>
		(entries() ?? []).filter((entry) => filter() === "all" || entry.kind === filter());

	async function save(): Promise<void> {
		const token = auth.token();
		const current = draft();
		if (!token || !current?.text.trim()) return;
		setBusy(true);
		try {
			const input = { kind: current.kind, text: current.text.trim() };
			if (current.id) await memoryService.edit(token, slug(), current.id, input);
			else await memoryService.add(token, slug(), input);
			setDraft(null);
			await load();
		} catch (cause) {
			setError(message(cause, "Could not keep that"));
		} finally {
			setBusy(false);
		}
	}

	async function remove(): Promise<void> {
		const token = auth.token();
		const entry = removing();
		if (!token || !entry) return;
		setBusy(true);
		try {
			await memoryService.remove(token, slug(), entry.id);
			setRemoving(null);
			await load();
		} catch (cause) {
			setRemoving(null);
			setError(message(cause, "Could not remove it"));
		} finally {
			setBusy(false);
		}
	}

	const add = () => (
		<Button
			size="sm"
			icon={<PlusIcon />}
			onClick={() => setDraft({ id: null, kind: "decision", text: "" })}
		>
			Add
		</Button>
	);

	return (
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<ShipPage>
				<ShipHeading
					title="Memory"
					meta="What this project's threads and people kept for later work. A new thread starts with what its first message is about."
					actions={add()}
				/>
				<div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
					<div class="min-w-0 flex-1">
						<SearchInput
							icon={<SearchIcon size="sm" />}
							aria-label="Search memory"
							placeholder="Search memory"
							value={query()}
							onInput={(event) => setQuery(event.currentTarget.value)}
						/>
					</div>
					<Segmented<Filter>
						label="Which kind"
						size="sm"
						value={filter()}
						onChange={setFilter}
						options={[
							{ value: "all", label: "All" },
							...MEMORY_KINDS.map((kind) => ({ value: kind.value, label: `${kind.label}s` })),
						]}
					/>
				</div>
				<Show when={error()}>{(text) => <Alert tone="danger" title={text()} />}</Show>
				<Show
					when={entries()}
					fallback={
						<Show when={!error()}>
							<Stack gap={2}>
								<Skeleton class="h-16" />
								<Skeleton class="h-16" />
							</Stack>
						</Show>
					}
				>
					<Show
						when={shown().length}
						fallback={
							<EmptyState
								icon={<IdeaIcon size="md" />}
								title={query() || filter() !== "all" ? "Nothing like that" : "Nothing kept yet"}
								description={
									query() || filter() !== "all"
										? "Try other words, or every kind."
										: "Agents keep what their work settles as they go. Add a decision or convention here, and the next thread about it starts knowing it."
								}
								action={query() || filter() !== "all" ? undefined : add()}
							/>
						}
					>
						<ShipRows>
							<For each={shown()}>
								{(entry) => (
									<div class="flex min-w-0 flex-col gap-2 p-4 md:flex-row md:items-start md:justify-between md:gap-4 md:px-5">
										<Stack gap={1} class="min-w-0">
											<div class="flex items-center gap-2">
												<Badge tone={KIND_TONE[entry.kind]}>
													{MEMORY_KINDS.find((kind) => kind.value === entry.kind)?.label ??
														entry.kind}
												</Badge>
												<Text size="caption" tone="subtle" truncate>
													{whose(entry)} · {relativeTime(entry.createdAt)}
													{entry.used
														? ` · started ${entry.used} thread${entry.used === 1 ? "" : "s"}`
														: ""}
												</Text>
											</div>
											<Text tone="strong" class="break-words whitespace-pre-wrap">
												{entry.text}
											</Text>
										</Stack>
										<div class="flex shrink-0 items-center gap-1">
											<Show when={entry.sessionId}>
												{(id) => (
													<Button
														size="sm"
														variant="ghost"
														onClick={() => navigate(`/chat/${slug()}/${id()}`)}
													>
														Thread
													</Button>
												)}
											</Show>
											<Button
												size="sm"
												variant="ghost"
												onClick={() =>
													setDraft({ id: entry.id, kind: entry.kind, text: entry.text })
												}
											>
												Edit
											</Button>
											<Button size="sm" variant="ghost" onClick={() => setRemoving(entry)}>
												Remove
											</Button>
										</div>
									</div>
								)}
							</For>
						</ShipRows>
					</Show>
				</Show>
			</ShipPage>

			<Dialog
				open={draft() !== null}
				onClose={() => setDraft(null)}
				title={draft()?.id ? "Edit memory" : "Add to memory"}
				description="One thing, in a sentence or two: the next thread about it starts knowing it."
				width="30rem"
				footer={
					<>
						<Button variant="ghost" onClick={() => setDraft(null)}>
							Cancel
						</Button>
						<Button disabled={busy() || !draft()?.text.trim()} onClick={() => void save()}>
							{draft()?.id ? "Save" : "Add"}
						</Button>
					</>
				}
			>
				<Show when={draft()}>
					{(form) => (
						<Stack gap={3}>
							<Field
								label="Kind"
								hint={MEMORY_KINDS.find((kind) => kind.value === form().kind)?.hint}
							>
								{() => (
									<Select<MemoryKind>
										label="Kind"
										look="field"
										value={form().kind}
										onChange={(kind) => setDraft({ ...form(), kind })}
										groups={[
											{ options: MEMORY_KINDS.map(({ value, label }) => ({ value, label })) },
										]}
									/>
								)}
							</Field>
							<Field label="What to remember">
								{(id) => (
									<Textarea
										id={id}
										rows={4}
										maxlength={1000}
										placeholder="Payments retry three times, then park the job: the provider double-charges on a fourth."
										value={form().text}
										onInput={(event) => setDraft({ ...form(), text: event.currentTarget.value })}
									/>
								)}
							</Field>
						</Stack>
					)}
				</Show>
			</Dialog>

			<ConfirmDialog
				open={removing() !== null}
				onClose={() => setRemoving(null)}
				onConfirm={() => void remove()}
				title="Remove this memory?"
				description="Threads that start from now on won't know it."
				confirm="Remove"
				danger
				stayOpen
				pending={busy()}
			/>
		</div>
	);
}
