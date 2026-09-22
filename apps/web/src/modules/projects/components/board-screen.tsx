"use client";

import { Badge } from "@grid/ui/components/badge";
import { Button } from "@grid/ui/components/button";
import { Input } from "@grid/ui/components/input";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useCreateProjectMutation, useCreateTaskMutation } from "../hooks/use-project-mutations";
import { useProjectsQuery, useProjectTasksQuery } from "../hooks/use-project-queries";
import { groupByStatus } from "../lib/board";
import { toSlug } from "../lib/slug";
import {
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
} from "../types/project.types";
import { TaskDetailSheet } from "./task-detail-sheet";

const selectClassName =
	"h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring";

export function BoardScreen() {
	const projects = useProjectsQuery();
	const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
	const [openTaskNumber, setOpenTaskNumber] = useState<number | null>(null);
	const activeSlug = selectedSlug ?? projects.data?.[0]?.slug ?? null;
	const tasks = useProjectTasksQuery(activeSlug);

	const columns = useMemo(() => groupByStatus(tasks.data ?? []), [tasks.data]);
	const openTask =
		openTaskNumber === null
			? undefined
			: tasks.data?.find((task) => task.number === openTaskNumber);

	if (projects.isLoading) {
		return <BoardMessage>Loading projects…</BoardMessage>;
	}

	if (projects.isError) {
		return <BoardMessage tone="error">{errorMessage(projects.error)}</BoardMessage>;
	}

	if (!projects.data?.length) {
		return <FirstProjectForm />;
	}

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<h1 className="font-semibold text-2xl tracking-tight">Board</h1>
					<p className="text-muted-foreground text-sm">
						{tasks.data?.length ?? 0} task{tasks.data?.length === 1 ? "" : "s"} across{" "}
						{TASK_STATUSES.length} stages
					</p>
				</div>
				<label className="flex items-center gap-2 text-muted-foreground text-xs">
					Project
					<select
						className={selectClassName}
						value={activeSlug ?? ""}
						onChange={(event) => {
							setSelectedSlug(event.target.value);
							setOpenTaskNumber(null);
						}}
					>
						{projects.data.map((project) => (
							<option key={project.slug} value={project.slug}>
								{project.name}
							</option>
						))}
					</select>
				</label>
			</header>

			<NewTaskForm slug={activeSlug} />

			{tasks.isError ? (
				<BoardMessage tone="error">{errorMessage(tasks.error)}</BoardMessage>
			) : (
				<div className="min-w-0 overflow-x-auto pb-2">
					<div className="flex min-w-max gap-3">
						{TASK_STATUSES.map((status) => (
							<BoardColumn
								key={status}
								status={status}
								tasks={columns[status]}
								loading={tasks.isLoading}
								onOpenTask={setOpenTaskNumber}
							/>
						))}
					</div>
				</div>
			)}

			{openTaskNumber !== null ? (
				<TaskDetailSheet
					slug={activeSlug}
					open
					onOpenChange={(isOpen) => {
						if (!isOpen) setOpenTaskNumber(null);
					}}
					task={openTask}
					loading={tasks.isLoading}
					error={tasks.error}
				/>
			) : null}
		</div>
	);
}

function BoardColumn({
	status,
	tasks,
	loading,
	onOpenTask,
}: {
	status: TaskStatus;
	tasks: Task[];
	loading: boolean;
	onOpenTask: (number: number) => void;
}) {
	return (
		<section className="flex w-64 shrink-0 flex-col gap-2">
			<header className="flex items-center justify-between gap-2 px-1">
				<h2 className="font-medium text-xs uppercase tracking-wide">
					{TASK_STATUS_LABELS[status]}
				</h2>
				<span className="font-mono text-[10px] text-muted-foreground">{tasks.length}</span>
			</header>
			<div className="flex min-h-16 flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
				{loading ? (
					<p className="px-1 py-2 text-muted-foreground text-xs">Loading…</p>
				) : tasks.length === 0 ? (
					<p className="px-1 py-2 text-muted-foreground text-xs">Empty</p>
				) : (
					tasks.map((task) => (
						<TaskCard key={task.key} task={task} onOpen={() => onOpenTask(task.number)} />
					))
				)}
			</div>
		</section>
	);
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="w-full space-y-2 rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-ring/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
		>
			<span className="flex items-baseline justify-between gap-2">
				<span className="font-mono text-[10px] text-muted-foreground">{task.key}</span>
				{task.owner ? (
					<Badge variant={task.owner.kind === "agent" ? "secondary" : "outline"}>
						{task.owner.name ?? task.owner.kind}
					</Badge>
				) : null}
			</span>
			<span className="block font-medium text-sm leading-5">{task.title}</span>
			{task.branch ? (
				<span className="block truncate font-mono text-[10px] text-muted-foreground">
					{task.branch}
				</span>
			) : null}
		</button>
	);
}

function NewTaskForm({ slug }: { slug: string | null }) {
	const create = useCreateTaskMutation(slug);
	const [title, setTitle] = useState("");
	const [ownerName, setOwnerName] = useState("");

	return (
		<form
			className="flex min-w-0 flex-wrap items-center gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				const trimmed = title.trim();
				if (!trimmed) return;
				create.mutate(
					{
						title: trimmed,
						...(ownerName.trim()
							? { ownerKind: "agent" as const, ownerName: ownerName.trim() }
							: {}),
					},
					{
						onSuccess: () => {
							setTitle("");
							setOwnerName("");
						},
					},
				);
			}}
		>
			<Input
				value={title}
				onChange={(event) => setTitle(event.target.value)}
				placeholder="New task title"
				className="h-8 w-full sm:w-72"
				maxLength={200}
			/>
			<Input
				value={ownerName}
				onChange={(event) => setOwnerName(event.target.value)}
				placeholder="Assign an agent (optional)"
				className="h-8 w-full sm:w-56"
				maxLength={120}
			/>
			<Button type="submit" size="sm" disabled={!title.trim() || create.isPending}>
				{create.isPending ? "Adding…" : "Add to backlog"}
			</Button>
			{create.isError ? (
				<p className="text-destructive text-xs">{errorMessage(create.error)}</p>
			) : null}
		</form>
	);
}

function FirstProjectForm() {
	const create = useCreateProjectMutation();
	const [name, setName] = useState("");

	return (
		<div className="max-w-lg space-y-4">
			<header className="space-y-1">
				<h1 className="font-semibold text-2xl tracking-tight">Board</h1>
				<p className="text-muted-foreground text-sm">
					A board belongs to a project. Create your first one to start filing tasks.
				</p>
			</header>
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					const trimmed = name.trim();
					if (!trimmed) return;
					create.mutate({ name: trimmed, slug: toSlug(trimmed) }, { onSuccess: () => setName("") });
				}}
			>
				<Input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Project name"
					className="h-8 w-full sm:w-72"
					maxLength={120}
				/>
				<Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
					{create.isPending ? "Creating…" : "Create project"}
				</Button>
			</form>
			{name.trim() ? (
				<p className="font-mono text-[10px] text-muted-foreground">slug: {toSlug(name)}</p>
			) : null}
			{create.isError ? (
				<p className="text-destructive text-xs">{errorMessage(create.error)}</p>
			) : null}
		</div>
	);
}

function BoardMessage({
	children,
	tone = "muted",
}: {
	children: React.ReactNode;
	tone?: "muted" | "error";
}) {
	return (
		<p className={cn("text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
			{children}
		</p>
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Something went wrong";
}
