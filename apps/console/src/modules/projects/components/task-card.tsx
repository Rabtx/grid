import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import {
	AgentLogo,
	Avatar,
	CardChip,
	ChatIcon,
	iconButton,
	Menu,
	type MenuGroup,
	MoreIcon,
	type PopoverControl,
	TaskCard as KitTaskCard,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { draftsStore, taskDraft } from "@/modules/chat/stores/drafts";

import { useWorkspace } from "../context/workspace-context";
import { laneOf, laneStatus } from "../lib/board";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";

import { StatusIcon } from "./status-icon";

/**
 * A task on the board: key, title, then who owns it and where the work lives.
 *
 * The card is a link to the task's own URL, so the panel opens over the board, the URL can be
 * shared, and a reload lands on the same task. Its menu (run with an agent, move to a stage) is a
 * ⋯ on hover for pointers and a long press on touch screens.
 */
export function TaskCard(props: {
	task: Task;
	/** Move the task to another stage, the same way the lane drop does. */
	onMove: (status: TaskStatus) => void;
	/** HTML5 drag source: switched on only where the pointer can drag and drop. */
	canDrag?: boolean;
	dragging?: boolean;
	onDragStart?: () => void;
	onDragEnd?: () => void;
}): JSX.Element {
	const workspace = useWorkspace();
	const navigate = useNavigate();
	// Carry the board's filters into the task URL, so closing the panel returns to the same view.
	const location = useLocation();
	let menu: PopoverControl | undefined;

	// Run with agent opens a new chat thread; moving to the current stage is not offered.
	const groups = (): MenuGroup[] => [
		{ items: [{ id: "run-with-agent", label: "Run with agent", icon: <ChatIcon size="sm" /> }] },
		{
			label: "Move to",
			items: TASK_STATUSES.filter((status) => status !== props.task.status).map((status) => ({
				id: status,
				label: TASK_STATUS_LABELS[status],
				icon: <StatusIcon status={status} />,
			})),
		},
	];

	function handleSelect(id: string): void {
		if (id === "run-with-agent") {
			const slug = workspace.activeSlug();
			if (!slug) return;
			draftsStore.set(slug, taskDraft(props.task));
			navigate(`/chat/${slug}`);
			return;
		}
		const status = TASK_STATUSES.find((candidate) => candidate === id);
		if (status) props.onMove(status);
	}

	return (
		<KitTaskCard
			id={props.task.key}
			title={props.task.title}
			href={workspaceHref(
				`/board/${workspace.activeSlug()}/tasks/${props.task.number}${location.search}`,
			)}
			owner={props.task.owner ? (props.task.owner.name ?? props.task.owner.kind) : null}
			label={[
				`${props.task.key} ${props.task.title}`,
				TASK_STATUS_LABELS[props.task.status],
				props.task.owner?.name ?? (props.task.owner ? props.task.owner.kind : "unassigned"),
			].join(", ")}
			ownerMark={props.task.owner ? <OwnerMark task={props.task} /> : undefined}
			tag={
				// Its column holds more than one stage: say which one this is (Backlog, Blocked, QA).
				laneStatus(laneOf(props.task.status)) !== props.task.status ? (
					<CardChip tone={props.task.status === "blocked" ? "danger" : undefined}>
						{TASK_STATUS_LABELS[props.task.status]}
					</CardChip>
				) : undefined
			}
			meta={props.task.branch ?? undefined}
			draggable={props.canDrag}
			dragging={props.dragging}
			onDragStart={(event) => {
				// A drag needs a payload of its own, or the browser refuses to start one.
				event.dataTransfer?.setData("text/plain", String(props.task.number));
				if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
				props.onDragStart?.();
			}}
			onDragEnd={() => props.onDragEnd?.()}
			onMenuAt={(point) => menu?.open(point)}
			actions={
				<Menu
					label={`Actions for ${props.task.key}`}
					trigger={<MoreIcon size="sm" />}
					triggerClass={iconButton({ size: "xs" })}
					groups={groups()}
					onSelect={handleSelect}
					placement="bottom-end"
					pointerOnly
					control={(control) => {
						menu = control;
					}}
				/>
			}
		/>
	);
}

/** A task's owner as a small mark: an agent's logo, a person's initials, nothing when nobody. */
export function OwnerMark(props: { task: Task }): JSX.Element {
	return (
		<Show when={props.task.owner}>
			{(owner) => (
				<span class="flex shrink-0 items-center" title={owner().name ?? undefined}>
					<span class="sr-only">
						{owner().name ?? (owner().kind === "agent" ? "An agent" : "Someone")}
					</span>
					<Show
						when={owner().kind === "agent"}
						fallback={<Avatar name={owner().name ?? "Someone"} size="xs" />}
					>
						<AgentLogo id={(owner().name ?? "").toLowerCase()} name={owner().name ?? "Agent"} />
					</Show>
				</span>
			)}
		</Show>
	);
}
