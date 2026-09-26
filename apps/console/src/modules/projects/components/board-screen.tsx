import { useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, Errored, isPending, Loading, Show } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import { Button, EmptyState, ErrorNotice } from "@/ui";

import { useWorkspace } from "../context/workspace-context";
import { filterTasks, groupByOwner, groupByStatus, ownerOptions } from "../lib/board";
import { TASK_STATUS_LABELS, TASK_STATUSES } from "../types/project.types";

import { BoardLanes, boardLaneId, type BoardLane, SkeletonLanes } from "./board-lanes";
import { BoardToolbar, type BoardView } from "./board-toolbar";
import { StageTabs } from "./stage-tabs";
import { StatusIcon } from "./status-icon";

export function BoardScreen(): JSX.Element {
	return (
		<Loading fallback={<SkeletonLanes />}>
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
			icon: () => (
				<span
					class={`size-3.5 shrink-0 rounded-full ${lane.id === "unassigned" ? "border border-ink/30 border-dashed" : "bg-ink/20"}`}
					aria-hidden="true"
				/>
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
			<div
				aria-hidden="true"
				class={`-mt-1 mb-2 h-0.5 rounded-full ${isPending(() => workspace.tasks()) ? "animate-pulse bg-accent" : "bg-transparent"}`}
			/>
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
				<p class="mb-2 text-ink/45 text-ui-sm tabular-nums">
					{filteredTasks().length} of {workspace.tasks().length} tasks
				</p>
			</Show>
			<Show
				when={!filteredEmpty()}
				fallback={
					<EmptyState
						title="No tasks match these filters"
						action={
							<button
								type="button"
								onClick={clearFilters}
								class="focus-ring -mx-2 min-h-11 rounded-sm px-2 text-link text-ui-sm underline-offset-2 hover:underline"
							>
								Clear filters
							</button>
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
			<ErrorNotice
				message={`The board could not load: ${props.error instanceof Error ? props.error.message : "something went wrong"}.`}
				action={
					<Button size="sm" variant="secondary" onClick={() => props.onRetry()}>
						Try again
					</Button>
				}
			/>
		</div>
	);
}

function ProjectNotFound(): JSX.Element {
	return (
		<EmptyState
			title="Project not found"
			description="It may have been renamed or archived."
			action={
				<a
					href={workspaceHref("/board")}
					class="focus-ring rounded-sm text-link text-ui-sm underline-offset-2 hover:underline"
				>
					Open your first project
				</a>
			}
		/>
	);
}
