import type { JSX } from "@solidjs/web";
import { useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Loading, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Alert,
	BranchIcon,
	Button,
	ChatIcon,
	CheckIcon,
	ClockIcon,
	CloseIcon,
	ConfirmDialog,
	DetailColumns,
	Dialog,
	EmptyState,
	IconButton,
	iconButton,
	Input,
	LinkIcon,
	Menu,
	MoreIcon,
	notify,
	PanelBar,
	PanelFooter,
	PropertyRow,
	QuietInput,
	RoleMark,
	Select,
	type SelectGroup,
	SEND_BUTTON,
	SendIcon,
	Skeleton,
	Stack,
	Text,
	ThreadDetailsCard,
	ThreadDetailsRow,
	ThreadDetailsSection,
	TitleInput,
	TrashIcon,
	UserIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { rememberAgent } from "@/modules/chat/lib/agent-choice";
import { draftsStore, taskDraft } from "@/modules/chat/stores/drafts";
import { providersStore } from "@/modules/chat/stores/providers";
import { rolesStore } from "@/modules/chat/stores/roles";
import { threadsStore } from "@/modules/chat/stores/threads";
import { placementsStore, scopeFor } from "@/modules/environments";

import { useWorkspace } from "../context/workspace-context";
import { relativeTime } from "../lib/relative-time";
import {
	assigneeValue,
	ownerFor,
	statusOnStart,
	threadsForTask,
	withoutKey,
} from "../lib/task-work";
import { projectsService } from "../services/projects.service";

import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskOwnerKind,
	type TaskStatus,
	type UpdateTaskInput,
} from "../types/project.types";

import { MarkdownField } from "./markdown-field";
import { StatusIcon } from "./status-icon";

const STATUS_GROUPS = [
	{
		options: TASK_STATUSES.map((status) => ({
			value: status,
			label: TASK_STATUS_LABELS[status],
			icon: <StatusIcon status={status} />,
		})),
	},
];

/**
 * The open task, as a wide panel over the board: what it is and the agent work on it beside its
 * properties (who has it, where it stands, its branch), and a box to start an agent on it. It is
 * mounted once per board route and driven entirely by the URL — `/board/:slug/tasks/:number`
 * opens it, the plain board URL closes it — so the panel, a shared link and a reload all agree on
 * which task is showing.
 */
export function TaskPanel(): JSX.Element {
	const workspace = useWorkspace();
	const number = () => workspace.activeTaskNumber();

	return (
		<Dialog
			kind="drawer"
			bare
			width="64rem"
			open={number() !== null}
			onClose={workspace.closeTask}
			// Naming the panel from the task itself would read the board's first load outside the
			// Loading boundary below, which defers the whole app's first render until it settles.
			title={number() === null ? "Task" : `Task ${number()}`}
		>
			<Loading fallback={<PanelSkeleton />}>
				<Show when={workspace.activeTask()} fallback={<TaskNotFound />}>
					{(task) => <TaskFields task={task()} />}
				</Show>
			</Loading>
		</Dialog>
	);
}

function TaskFields(props: { task: Task }): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	// The drafts start neutral and are seeded from the task below: a `props` read in a component
	// body is untracked, so Solid's dev build flags it instead of letting it silently not update.
	const [title, setTitle] = createSignal("");
	const [status, setStatus] = createSignal<TaskStatus>("backlog");
	const [ownerKind, setOwnerKind] = createSignal<TaskOwnerKind | null>(null);
	const [ownerName, setOwnerName] = createSignal("");
	const [branch, setBranch] = createSignal("");
	const [description, setDescription] = createSignal("");
	// A counter, not a flag: two fields can be in flight after a quick edit and a blur.
	const [saveCount, setSaveCount] = createSignal(0);
	const [error, setError] = createSignal<string | null>(null);
	const [confirming, setConfirming] = createSignal(false);
	const [deleting, setDeleting] = createSignal(false);

	const saving = () => saveCount() > 0;
	const me = () => auth.user()?.username ?? null;
	// The agents and roles Grid knows on this project's machine: the assignee picker offers them by
	// name, and "Start with…" opens a chat with the one picked.
	const scope = () => scopeFor(placementsStore.environmentOf(workspace.activeSlug() ?? undefined));
	const agents = () => providersStore.providers(scope());
	const roles = () => rolesStore.roles(scope());
	const known = () => [...agents().map((agent) => agent.name), ...roles().map((role) => role.name)];
	createEffect(
		() => [auth.token(), scope()] as const,
		([token, where]) => {
			if (!token) return;
			void providersStore.load(token, where);
			void rolesStore.load(token, where);
		},
	);
	// Yours when it names you: the board's "Assigned to me" matches the same way.
	const ownerChoice = () => assigneeValue({ kind: ownerKind(), name: ownerName() }, me(), known());
	const assigneeGroups = (): SelectGroup<string>[] => [
		{
			options: [
				{ value: "none", label: "Nobody" },
				{ value: "me", label: "Me", icon: <UserIcon size="sm" /> },
			],
		},
		...(agents().length
			? [
					{
						label: "Agents",
						options: agents().map((agent) => ({
							value: `agent:${agent.name}`,
							label: agent.name,
							icon: <AgentLogo id={agent.id} name={agent.name} />,
						})),
					},
				]
			: []),
		...(roles().length
			? [
					{
						label: "Roles",
						options: roles().map((role) => ({
							value: `agent:${role.name}`,
							label: role.name,
							icon: <RoleMark icon={role.icon ?? "code"} size="sm" />,
						})),
					},
				]
			: []),
		{
			label: "Someone else",
			options: [
				{ value: "human", label: "A person" },
				{ value: "agent", label: "Another agent" },
			],
		},
	];

	// Seeding is keyed on the task's number, not on the task object: a board refresh after a save
	// must not overwrite an edit the user is still typing in another field. The read is untracked
	// to say so, since an effect's apply phase cannot track.
	createEffect(
		() => props.task.number,
		() => {
			const task = untrack(() => props.task);
			setTitle(task.title);
			setStatus(task.status);
			setOwnerKind(task.owner?.kind ?? null);
			setOwnerName(task.owner?.name ?? "");
			setBranch(task.branch ?? "");
			setDescription(task.description ?? "");
			setError(null);
		},
	);

	/** Send one changed field, then re-read the board. `restore` puts the field back on failure. */
	async function save(input: UpdateTaskInput, restore: () => void): Promise<void> {
		const token = auth.token();
		const slug = workspace.activeSlug();
		if (!token || !slug) return;

		setError(null);
		setSaveCount((count) => count + 1);
		try {
			await projectsService.updateTask(token, slug, props.task.number, input);
			workspace.refreshTasks();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not save the task");
			restore();
		} finally {
			setSaveCount((count) => count - 1);
		}
	}

	async function commitTitle(): Promise<void> {
		const task = props.task;
		const next = title().trim();
		if (next.length === 0) {
			setTitle(task.title);
			return;
		}
		setTitle(next);
		if (next === task.title) return;
		await save({ title: next }, () => setTitle(task.title));
	}

	async function changeStatus(value: string): Promise<void> {
		const next = TASK_STATUSES.find((candidate) => candidate === value);
		if (!next || next === props.task.status) return;
		const previous = props.task.status;
		setStatus(next);
		await save({ status: next }, () => setStatus(previous));
	}

	async function changeOwner(next: string): Promise<void> {
		const owner = ownerFor(next, me());
		if (!owner) return;
		const previous = { kind: props.task.owner?.kind ?? null, name: props.task.owner?.name ?? "" };
		if (owner.ownerKind === previous.kind && (owner.ownerName ?? previous.name) === previous.name)
			return;
		setOwnerKind(owner.ownerKind);
		// Picking "A person" or "Another agent" keeps the name for typing; the rest name it.
		if (owner.ownerName !== undefined) setOwnerName(owner.ownerName ?? "");
		await save(owner, () => {
			setOwnerKind(previous.kind);
			setOwnerName(previous.name);
		});
	}

	async function commitOwnerName(): Promise<void> {
		const previous = props.task.owner?.name ?? "";
		const next = ownerName().trim();
		setOwnerName(next);
		if (next === previous) return;
		await save({ ownerName: next.length === 0 ? null : next }, () => setOwnerName(previous));
	}

	async function commitBranch(): Promise<void> {
		const previous = props.task.branch ?? "";
		const next = branch().trim();
		setBranch(next);
		if (next === previous) return;
		await save({ branch: next.length === 0 ? null : next }, () => setBranch(previous));
	}

	async function commitDescription(): Promise<void> {
		const previous = props.task.description ?? "";
		const next = description();
		if (next === previous) return;
		await save({ description: next.trim().length === 0 ? null : next }, () =>
			setDescription(previous),
		);
	}

	async function deleteTask(): Promise<void> {
		const token = auth.token();
		const slug = workspace.activeSlug();
		if (!token || !slug) return;

		setDeleting(true);
		setError(null);
		try {
			await projectsService.deleteTask(token, slug, props.task.number);
			setConfirming(false);
			workspace.closeTask();
			workspace.refreshTasks();
		} catch (cause) {
			setConfirming(false);
			setError(cause instanceof Error ? cause.message : "Could not delete the task");
		} finally {
			setDeleting(false);
		}
	}

	const [message, setMessage] = createSignal("");
	const [copied, setCopied] = createSignal(false);
	// Who "Start with…" opens a chat with: the agent the task is assigned to, else the first one.
	const [startAgent, setStartAgent] = createSignal<string | null>(null);
	const assignedAgent = () =>
		props.task.owner?.kind === "agent"
			? agents().find((agent) => agent.name.toLowerCase() === props.task.owner?.name?.toLowerCase())
			: undefined;
	const starter = () =>
		agents().find((agent) => agent.id === startAgent()) ?? assignedAgent() ?? agents()[0] ?? null;

	/**
	 * Start an agent on this task: a chat that opens with the task and what was written, with the
	 * agent picked. A task nobody has goes to that agent, and one not yet started moves to In
	 * progress, so the board says who is on it.
	 */
	function runWithAgent(note = ""): void {
		const slug = workspace.activeSlug();
		if (!slug) return;
		const draft = taskDraft(props.task);
		draftsStore.set(slug, note.trim() ? `${draft}\n\n${note.trim()}` : draft);
		const agent = starter();
		if (agent) {
			rememberAgent(agent.id);
			const patch: UpdateTaskInput = {};
			if (!props.task.owner) Object.assign(patch, { ownerKind: "agent", ownerName: agent.name });
			const next = statusOnStart(props.task.status);
			if (next) patch.status = next;
			if (Object.keys(patch).length) void save(patch, () => undefined);
		}
		navigate(`/chat/${slug}`);
	}

	// The threads started from this task (a chat opened from it is titled with its key).
	const work = createMemo(() =>
		threadsForTask(threadsStore.threads(workspace.activeSlug() ?? ""), props.task.key),
	);
	const agentLabel = (id: string) => agents().find((agent) => agent.id === id)?.name ?? id;
	const workState = (id: string, updatedAt: string) =>
		threadsStore.isWaiting(id)
			? "Needs you"
			: threadsStore.isRunning(id)
				? "Working"
				: relativeTime(updatedAt);

	async function copyLink(): Promise<void> {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			notify({ title: "Could not copy the link", tone: "danger" });
		}
	}

	return (
		<div class="flex h-full min-h-0 flex-col">
			<PanelBar
				actions={
					<>
						<IconButton
							size="sm"
							label={copied() ? "Link copied" : "Copy link"}
							onClick={() => void copyLink()}
						>
							<Show when={copied()} fallback={<LinkIcon />}>
								<CheckIcon />
							</Show>
						</IconButton>
						<Menu
							label={`Actions for ${props.task.key}`}
							trigger={<MoreIcon />}
							triggerClass={iconButton({ size: "sm" })}
							placement="bottom-end"
							groups={[
								{
									items: [{ id: "run", label: "Run with agent", icon: <ChatIcon size="sm" /> }],
								},
								{
									items: [
										{
											id: "delete",
											label: "Delete task",
											icon: <TrashIcon size="sm" />,
											danger: true,
										},
									],
								},
							]}
							onSelect={(id) => {
								if (id === "run") runWithAgent();
								else if (id === "delete") setConfirming(true);
							}}
						/>
						<IconButton size="sm" label="Close task" onClick={workspace.closeTask}>
							<CloseIcon />
						</IconButton>
					</>
				}
			>
				<Text as="span" size="body" tone="strong" mono class="shrink-0">
					{props.task.key}
				</Text>
				<Text as="span" size="caption" tone="subtle" truncate>
					{saving()
						? "Saving…"
						: `${TASK_STATUS_LABELS[status()]} · updated ${relativeTime(props.task.updatedAt)}`}
				</Text>
			</PanelBar>

			<div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
				<DetailColumns
					head={
						<Stack gap={3}>
							<Show when={error()}>
								{(message) => (
									<Alert tone="danger" title={message()} onDismiss={() => setError(null)} />
								)}
							</Show>
							<TitleInput
								value={title()}
								onInput={(event) => setTitle(event.currentTarget.value)}
								onBlur={() => void commitTitle()}
								onKeyDown={saveOnEnter}
								placeholder="Task title"
								aria-label="Task title"
								maxlength={200}
							/>
						</Stack>
					}
					aside={
						<ThreadDetailsCard>
							<ThreadDetailsSection title="Properties">
								<div class="flex flex-col gap-1 px-2.5 pb-1">
									<PropertyRow label="Status">
										<Select<TaskStatus>
											label="Status"
											look="chip"
											groups={STATUS_GROUPS}
											value={status()}
											onChange={(value) => void changeStatus(value)}
										/>
									</PropertyRow>
									<PropertyRow label="Assignee">
										<Select<string>
											label="Assignee"
											look="chip"
											groups={assigneeGroups()}
											value={ownerChoice()}
											onChange={(next) => void changeOwner(next)}
										/>
									</PropertyRow>
									<Show when={ownerChoice() === "human" || ownerChoice() === "agent"}>
										<PropertyRow label={ownerKind() === "agent" ? "Agent" : "Person"}>
											<QuietInput
												value={ownerName()}
												onInput={(event) => setOwnerName(event.currentTarget.value)}
												onBlur={() => void commitOwnerName()}
												onKeyDown={saveOnEnter}
												aria-label={ownerKind() === "agent" ? "Agent name" : "Person's name"}
												placeholder={ownerKind() === "agent" ? "Which agent" : "Who"}
											/>
										</PropertyRow>
									</Show>
									<PropertyRow label="Branch">
										<span class="shrink-0 text-fg-subtle [&_svg]:size-4">
											<BranchIcon />
										</span>
										<QuietInput
											value={branch()}
											onInput={(event) => setBranch(event.currentTarget.value)}
											onBlur={() => void commitBranch()}
											onKeyDown={saveOnEnter}
											aria-label="Branch"
											placeholder="No branch yet"
											class="font-mono"
										/>
									</PropertyRow>
								</div>
							</ThreadDetailsSection>
							<ThreadDetailsSection title="Details">
								<ThreadDetailsRow icon={<LinkIcon />} label="Key" value={props.task.key} />
								<ThreadDetailsRow
									icon={<ClockIcon />}
									label="Created"
									value={relativeTime(props.task.createdAt)}
								/>
								<ThreadDetailsRow
									icon={<ClockIcon />}
									label="Updated"
									value={relativeTime(props.task.updatedAt)}
								/>
							</ThreadDetailsSection>
						</ThreadDetailsCard>
					}
					main={
						<>
							<MarkdownField
								label="Description"
								value={description()}
								onInput={setDescription}
								onBlur={() => void commitDescription()}
								onSubmit={() => void commitDescription()}
								placeholder="Context a teammate or an agent needs, in Markdown"
								rows={6}
							/>
							<ThreadDetailsCard>
								<ThreadDetailsSection
									title="Agent work"
									actions={
										<Show when={work().length > 0}>
											<Text as="span" size="caption" tone="subtle">
												{work().length} thread{work().length === 1 ? "" : "s"}
											</Text>
										</Show>
									}
								>
									<Show
										when={work().length > 0}
										fallback={
											<p class="px-2.5 pb-1 text-caption text-fg-subtle">
												No agent has worked on this task yet. Start one below, and its thread shows
												here.
											</p>
										}
									>
										<For each={work()}>
											{(thread) => (
												<ThreadDetailsRow
													icon={
														<AgentLogo id={thread.provider} name={agentLabel(thread.provider)} />
													}
													label={withoutKey(thread.title, props.task.key)}
													title={thread.title}
													value={workState(thread.id, thread.updatedAt)}
													href={workspaceHref(
														`/chat/${encodeURIComponent(thread.project)}/${encodeURIComponent(thread.id)}`,
													)}
												/>
											)}
										</For>
									</Show>
								</ThreadDetailsSection>
							</ThreadDetailsCard>
						</>
					}
				/>
			</div>

			{/* Start an agent on the task: a chat with the task in it, with the agent picked here. */}
			<PanelFooter
				onSubmit={() => {
					runWithAgent(message());
					setMessage("");
				}}
			>
				<Show when={agents().length > 1}>
					<Select<string>
						label="Agent to start"
						look="chip"
						placement="top-start"
						groups={[
							{
								options: agents().map((agent) => ({
									value: agent.id,
									label: agent.name,
									icon: <AgentLogo id={agent.id} name={agent.name} />,
								})),
							},
						]}
						value={starter()?.id ?? ""}
						onChange={setStartAgent}
					/>
				</Show>
				<Input
					shape="pill"
					value={message()}
					onInput={(event) => setMessage(event.currentTarget.value)}
					aria-label="Message an agent about this task"
					placeholder={
						starter()
							? `Start ${starter()?.name} on this task…`
							: props.task.owner?.kind === "agent" && props.task.owner.name
								? `Message ${props.task.owner.name} about this task…`
								: "Ask an agent about this task…"
					}
				/>
				<button
					type="submit"
					aria-label="Start a thread"
					disabled={!message().trim()}
					class={SEND_BUTTON}
				>
					<SendIcon />
				</button>
			</PanelFooter>

			<ConfirmDialog
				open={confirming()}
				title={`Delete ${props.task.key}?`}
				description="This can't be undone."
				confirm="Delete task"
				danger
				pending={deleting()}
				stayOpen
				onConfirm={() => void deleteTask()}
				onClose={() => setConfirming(false)}
			/>
		</div>
	);
}

/** Enter in a single-line field saves it, exactly as leaving the field does. */
function saveOnEnter(event: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
	if (event.key !== "Enter") return;
	event.preventDefault();
	event.currentTarget.blur();
}

function PanelSkeleton(): JSX.Element {
	return (
		<div class="flex h-full flex-col">
			<PanelBar>
				<Skeleton class="h-3 w-16" />
			</PanelBar>
			<Stack gap={3} class="p-4 md:p-5">
				<Skeleton class="h-6 w-2/3" />
				<Skeleton class="h-kit-control w-full" />
				<Skeleton class="h-kit-control w-full" />
				<Skeleton class="h-24 w-full" />
			</Stack>
		</div>
	);
}

function TaskNotFound(): JSX.Element {
	const workspace = useWorkspace();

	return (
		<div class="flex h-full min-h-0 flex-col">
			<PanelBar
				actions={
					<IconButton size="sm" label="Close task" onClick={workspace.closeTask}>
						<CloseIcon />
					</IconButton>
				}
			>
				{null}
			</PanelBar>
			<EmptyState
				title="Task not found"
				description="It may have been deleted, or the link may be wrong."
				action={
					<Button variant="secondary" onClick={workspace.closeTask}>
						Back to the board
					</Button>
				}
			/>
		</div>
	);
}
