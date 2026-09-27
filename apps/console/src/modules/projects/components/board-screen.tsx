import { useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, Errored, isPending, Loading, Show } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import {
	Alert,
	Avatar,
	BoardSkeleton,
	Button,
	button,
	EmptyState,
	LinkButton,
	LoadingBar,
	NobodyMark,
	Text,
} from "@/kit";

import { useWorkspace } from "../context/workspace-context";
import { filterTasks, groupByOwner, groupByStatus, ownerOptions } from "../lib/board";
import { TASK_STATUS_LABELS, TASK_STATUSES } from "../types/project.types";

import { BoardLanes, boardLaneId, type BoardLane } from "./board-lanes";
import { BoardToolbar, type BoardView } from "./board-toolbar";
import { StageTabs } from "./stage-tabs";
import { StatusIcon } from "./status-icon";

export function BoardScreen(): JSX.Element {
	return (
		<Loading fallback={<BoardSkeleton />}>
			<Errored fallback={(error, reset) => <BoardError error={error()} onRetry={reset} />}>
				<Board />
			</Errored>
		</Loading>
	);
}

function Board(): JSX.Element {
	const workspace = useWorkspace();
	const [searchParams, setSearchParams] = useSearchParams();
	const view = createMemo<BoardView>(() => (searchParams.view === "owner" ? "owner" : "status"));
	const query = createMemo(() => (typeof searchParams.q === "string" ? searchParams.q : ""));
	const owner = createMemo(() =>
		typeof searchParams.owner === "string" ? searchParams.owner : "all",
	);
	const filteredTasks = createMemo(() =>
		filterTasks(workspace.tasks(), { query: query(), owner: owner() }),
	);
	const options = createMemo(() => ownerOptions(workspace.tasks()));
	const statusLanes = createMemo<BoardLane[]>(() => {
		const columns = groupByStatus(filteredTasks());
		return TASK_STATUSES.map((status) => ({
			id: status,
			title: TASK_STATUS_LABELS[status],
			icon: () => <StatusIcon status={status} />,
			tasks: columns[status],
		}));
	});
	const ownerLanes = createMemo<BoardLane[]>(() =>
		groupByOwner(filteredTasks()).map((lane) => ({
			id: lane.id,
			title: lane.title,
			icon: () =>
				lane.id === "unassigned" ? (
					<NobodyMark size="xs" />
				) : (
					<Avatar name={lane.title} size="xs" />
				),
			tasks: lane.tasks,
		})),
	);
	const lanes = createMemo(() => (view() === "owner" ? ownerLanes() : statusLanes()));
	const isFiltered = createMemo(() => query().trim().length > 0 || owner() !== "all");
	const filteredEmpty = createMemo(() => isFiltered() && filteredTasks().length === 0);
	const [selectedLane, setSelectedLane] = createSignal("");
	const activeLane = createMemo(() => {
		const selected = selectedLane();
		const currentLanes = lanes();
		return currentLanes.some((lane) => lane.id === selected)
			? selected
			: (currentLanes[0]?.id ?? "");
	});

	function selectLane(lane: string): void {
		setSelectedLane(lane);
		document
			.getElementById(boardLaneId(lane))
			?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
	}

	function clearFilters(): void {
		setSearchParams({ q: undefined, owner: undefined });
	}

	return (
		<Show when={workspace.activeProject()} fallback={<ProjectNotFound />}>
			<div class="-mt-1 mb-2">
				<LoadingBar active={isPending(() => workspace.tasks())} />
			</div>
			<BoardToolbar
				view={view()}
				onViewChange={(next) => setSearchParams({ view: next === "status" ? undefined : next })}
				query={query()}
				onQueryChange={(next) => setSearchParams({ q: next || undefined }, { replace: true })}
				owner={owner()}
				ownerOptions={options()}
				onOwnerChange={(next) => setSearchParams({ owner: next === "all" ? undefined : next })}
			/>
			{/* The bar already shows the total; only a filter makes a count worth repeating. */}
			<Show when={isFiltered()}>
				<Text tone="subtle" tabular class="mb-2">
					{filteredTasks().length} of {workspace.tasks().length} tasks
				</Text>
			</Show>
			<Show
				when={!filteredEmpty()}
				fallback={
					<EmptyState
						title="No tasks match these filters"
						action={
							<LinkButton tone="accent" onClick={clearFilters}>
								Clear filters
							</LinkButton>
						}
					/>
				}
			>
				<StageTabs lanes={lanes()} active={activeLane()} onSelect={selectLane} />
				<BoardLanes lanes={lanes()} onActiveChange={setSelectedLane} />
			</Show>
		</Show>
	);
}

function BoardError(props: { error: unknown; onRetry: () => void }): JSX.Element {
	return (
		<div class="py-6">
			<Alert
				tone="danger"
				title="The board could not load"
				action={
					<Button size="sm" onClick={() => props.onRetry()}>
						Try again
					</Button>
				}
			>
				{props.error instanceof Error ? props.error.message : "Something went wrong."}
			</Alert>
		</div>
	);
}

function ProjectNotFound(): JSX.Element {
	return (
		<EmptyState
			title="Project not found"
			description="It may have been renamed or archived."
			action={
				<a href={workspaceHref("/board")} class={button({ size: "sm" })}>
					Open your first project
				</a>
			}
		/>
	);
}
