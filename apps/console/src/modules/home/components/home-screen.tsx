import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, Errored, For, Loading, Show } from "solid-js";

import {
	Alert,
	AlertIcon,
	Button,
	Card,
	CheckCircleIcon,
	ClockIcon,
	Grid,
	ListRow,
	Page,
	PageHeader,
	PaneHeader,
	PullRequestIcon,
	Section,
	Skeleton,
	SpinnerIcon,
	Text,
	TextLink,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { now as clockNow } from "@/lib/clock";
import { useAuth } from "@/modules/auth";
import { automationsService } from "@/modules/automations/services/automations.service";
import { untilLabel } from "@/modules/automations/lib/triggers";
import { type InboxItem, type InboxKind, inboxStore } from "@/modules/inbox";
import { projectsService, StatusIcon, TASK_STATUS_LABELS, useWorkspace } from "@/modules/projects";
import { relativeTime } from "@/modules/projects/lib/relative-time";

import {
	dayLabel,
	greeting,
	LIMITS,
	movingTasks,
	needsYou,
	ownerLabel,
	type ProjectTask,
	summary,
	upcoming,
} from "../lib/today";

/** The same signs the Inbox uses, so an item reads the same in both places. */
const KIND_ICONS: Record<InboxKind, () => JSX.Element> = {
	approval: () => <SpinnerIcon class="size-4 text-warning" />,
	turn_done: () => <CheckCircleIcon size="sm" class="text-success" />,
	turn_error: () => <AlertIcon size="sm" class="text-danger" />,
	pull_review: () => <PullRequestIcon size="sm" />,
	pull_checks: () => <AlertIcon size="sm" class="text-danger" />,
};

/** Every project's tasks, read together; a project that does not answer is counted, not fatal. */
type MovingView = { entries: ProjectTask[]; failed: number };

/**
 * The first screen of the day: what needs you (the newest unread inbox items), the work in
 * flight across every project and who has it, and the automations that run next. Each row opens
 * the thing itself; each part links to its full list.
 */
export function HomeScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	// Read inside the UI, so the greeting and the date turn over with the shared clock.
	const today = () => new Date(clockNow());

	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void inboxStore.load(token);
		},
	);

	const moving = createMemo(async (): Promise<MovingView> => {
		const token = auth.token();
		const projects = workspace.projects();
		if (!token || projects.length === 0) return { entries: [], failed: 0 };
		const answers = await Promise.all(
			projects.map((project) =>
				projectsService.listTasks(token, project.slug).then(
					(tasks) => tasks.map((task) => ({ project, task })),
					() => null,
				),
			),
		);
		const failed = answers.filter((answer) => answer === null).length;
		// Every project failing is an error to show and retry; some failing is a note under the list.
		if (failed === projects.length) throw new Error("The boards did not answer");
		return { entries: movingTasks(answers.flatMap((answer) => answer ?? [])), failed };
	});

	const automations = createMemo(async () => {
		const token = auth.token();
		if (!token) return { items: [], failed: false };
		return automationsService.list(token).then(
			(items) => ({ items: upcoming(items), failed: false }),
			// The runner being offline only hides this part; the rest of Today still works.
			() => ({ items: [], failed: true }),
		);
	});

	function openItem(item: InboxItem): void {
		const token = auth.token();
		if (token) void inboxStore.open(token, item);
		navigate(workspaceHref(item.url));
	}

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<PaneHeader title="Home" detail={dayLabel(today())} />
			<Page width="lg">
				{/* The count of moving tasks joins the line once the boards answer; until then it is left out. */}
				<Loading fallback={<Greeting date={today()} moving={0} />}>
					<Errored fallback={() => <Greeting date={today()} moving={0} />}>
						<Greeting date={today()} moving={moving().entries.length} />
					</Errored>
				</Loading>

				<Section
					title="Needs you"
					action={<TextLink href={workspaceHref("/inbox")}>Open Inbox</TextLink>}
				>
					<Show when={inboxStore.loaded()} fallback={<RowsSkeleton count={2} />}>
						<Show when={inboxStore.error()}>
							{(reason) => (
								<Alert
									tone="danger"
									title={reason()}
									action={
										<Button
											size="sm"
											onClick={() => {
												const token = auth.token();
												if (token) void inboxStore.load(token, true);
											}}
										>
											Try again
										</Button>
									}
								/>
							)}
						</Show>
						<Show
							when={needsYou(inboxStore.items()).length > 0}
							fallback={
								<Show when={!inboxStore.error()}>
									<Quiet>Nothing is waiting on you.</Quiet>
								</Show>
							}
						>
							<Rows>
								<For each={needsYou(inboxStore.items())}>
									{(item) => (
										<ListRow
											title={item.title}
											subtitle={`${item.project} · ${item.body}`}
											trailing={relativeTime(item.createdAt)}
											icon={KIND_ICONS[item.kind]()}
											onClick={() => openItem(item)}
										/>
									)}
								</For>
							</Rows>
						</Show>
					</Show>
				</Section>

				<Grid columns={2} gap={8}>
					<Section
						title="Moving now"
						action={<TextLink href={workspaceHref("/board")}>Board</TextLink>}
					>
						<Loading fallback={<RowsSkeleton count={3} />}>
							<Errored
								fallback={(error, reset) => (
									<Alert
										tone="danger"
										title={
											error() instanceof Error ? (error() as Error).message : "Something went wrong"
										}
										action={
											<Button size="sm" onClick={reset}>
												Try again
											</Button>
										}
									/>
								)}
							>
								<Show
									when={moving().entries.length > 0}
									fallback={
										<Quiet>No work in flight. Tasks you or an agent start show up here.</Quiet>
									}
								>
									<Rows>
										<For each={moving().entries.slice(0, LIMITS.moving)}>
											{(entry) => (
												<ListRow
													title={`#${entry.task.number} ${entry.task.title}`}
													subtitle={`${entry.project.name} · ${ownerLabel(entry.task)} · ${TASK_STATUS_LABELS[entry.task.status]}`}
													trailing={relativeTime(entry.task.updatedAt)}
													icon={<StatusIcon status={entry.task.status} />}
													onClick={() =>
														navigate(
															workspaceHref(
																`/board/${entry.project.slug}/tasks/${entry.task.number}`,
															),
														)
													}
												/>
											)}
										</For>
									</Rows>
								</Show>
								<Show when={moving().failed > 0}>
									<Quiet>
										{moving().failed === 1
											? "One project's board did not answer."
											: `${moving().failed} projects' boards did not answer.`}
									</Quiet>
								</Show>
							</Errored>
						</Loading>
					</Section>

					<Section
						title="Up next"
						action={<TextLink href={workspaceHref("/automations")}>Automations</TextLink>}
					>
						<Loading fallback={<RowsSkeleton count={2} />}>
							<Show
								when={!automations().failed}
								fallback={
									<Quiet>Automations did not answer; this machine's runner may be offline.</Quiet>
								}
							>
								<Show
									when={automations().items.length > 0}
									fallback={
										<Quiet>
											Nothing scheduled. Automations you set up show their next run here.
										</Quiet>
									}
								>
									<Rows>
										<For each={automations().items}>
											{(item) => (
												<ListRow
													title={item.name}
													subtitle={
														workspace.projects().find((project) => project.slug === item.project)
															?.name ?? item.project
													}
													trailing={item.nextRunAt ? untilLabel(item.nextRunAt) : undefined}
													icon={<ClockIcon size="sm" />}
													onClick={() => navigate(workspaceHref("/automations"))}
												/>
											)}
										</For>
									</Rows>
								</Show>
							</Show>
						</Loading>
					</Section>
				</Grid>
			</Page>
		</div>
	);
}

/** "Good morning, shabir" and the line under it. */
function Greeting(props: { date: Date; moving: number }): JSX.Element {
	const auth = useAuth();
	return (
		<PageHeader
			title={
				auth.user() ? `${greeting(props.date)}, ${auth.user()?.username}` : greeting(props.date)
			}
			description={summary(inboxStore.unread(), props.moving)}
		/>
	);
}

/** A part's rows on one card. */
function Rows(props: { children: JSX.Element }): JSX.Element {
	return (
		<Card padding="none">
			<div class="flex flex-col p-1">{props.children}</div>
		</Card>
	);
}

/** A part with nothing to show says so in one quiet line. */
function Quiet(props: { children: JSX.Element }): JSX.Element {
	return <Text tone="subtle">{props.children}</Text>;
}

function RowsSkeleton(props: { count: number }): JSX.Element {
	return (
		<div class="flex flex-col gap-1.5">
			<For each={Array.from({ length: props.count })}>{() => <Skeleton class="h-12" />}</For>
		</div>
	);
}
