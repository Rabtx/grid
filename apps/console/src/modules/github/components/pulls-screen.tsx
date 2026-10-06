import { useMatch, useNavigate, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";

import {
	AgentLogo,
	Alert,
	Avatar,
	Button,
	EmptyState,
	IconButton,
	PullGroupLabel,
	PullListRow,
	PullPanelRow,
	PullRequestIcon,
	RestoreIcon,
	Segmented,
	Skeleton,
	Stack,
	Text,
	TextLink,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { agentName } from "@/modules/chat/stores/providers";
import { placementsStore } from "@/modules/environments";
import { useWorkspace } from "@/modules/projects";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { ShellSlot, useShell } from "@/modules/shell";

import { agentOf, madeBy, pullLine, pullTone } from "../lib/pull-look";
import { pullsService } from "../services/pulls.service";
import type { PullState, PullSummary } from "../types/github.types";

import { PullChanges } from "./pull-changes";
import { PullDocument } from "./pull-document";

const NEEDS_GITHUB = /connect github/i;
const NEEDS_FOLDER = /choose this project's folder/i;

const STATES = [
	{ value: "open", label: "Open" },
	{ value: "merged", label: "Merged" },
	{ value: "closed", label: "Closed" },
] as const satisfies readonly { value: PullState; label: string }[];

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * A project's pull requests on GitHub (Figma 18 · Pull requests): those waiting on your review and
 * the rest open, in the panel; the open one as a document, or its changes to review. Each has its
 * own address (`/pulls/grid/142`, `/pulls/grid/142/changes`); phones list them first, with Open,
 * Merged and Closed.
 */
export function PullsScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const shell = useShell();
	const navigate = useNavigate();
	const match = useMatch(() => "/pulls/:slug/:number?/:view?");
	const [search, setSearch] = useSearchParams<{ pr?: string; state?: string }>();
	const slug = () => match()?.params.slug ?? "";
	const number = () => {
		const value = Number(match()?.params.number);
		return Number.isInteger(value) && value > 0 ? value : null;
	};
	const reviewing = () => match()?.params.view === "changes";
	const state = (): PullState =>
		STATES.some((option) => option.value === search.state) ? (search.state as PullState) : "open";
	const scope = () => placementsStore.scopeOf(slug());
	const href = (pull: number, view?: "changes") =>
		workspaceHref(`/pulls/${slug()}/${pull}${view ? `/${view}` : ""}`);

	// Links from before each pull request had its own address (`?pr=12`) land on it.
	createEffect(
		() => [search.pr, slug()] as const,
		([pr, project]) => {
			if (pr && project) navigate(`/pulls/${project}/${pr}`, { replace: true });
		},
	);

	const [open, setOpen] = createSignal<PullSummary[] | null>(null);
	const [waiting, setWaiting] = createSignal<Set<number>>(new Set());
	const [others, setOthers] = createSignal<PullSummary[] | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [revision, setRevision] = createSignal(0);
	const [openLimit, setOpenLimit] = createSignal(100);
	const [othersLimit, setOthersLimit] = createSignal(100);

	createEffect(
		() => slug(),
		() => {
			setOpenLimit(100);
			setOthersLimit(100);
		},
	);

	createEffect(
		() => [auth.token(), slug(), workspace.folders()[slug()], revision(), openLimit()] as const,
		([token, project, folder, _rev, limit]) => {
			setOpen(null);
			setError(null);
			if (!token || !project) return;
			if (!folder) return;
			void Promise.all([
				pullsService.list(token, project, "open", "open", limit),
				pullsService.list(token, project, "review", "open", limit).catch(() => [] as PullSummary[]),
			]).then(
				([all, review]) => {
					if (project !== untrack(slug)) return;
					setWaiting(new Set((review ?? []).map((pull) => pull.number)));
					setOpen(all ?? []);
				},
				(cause) => {
					if (project !== untrack(slug)) return;
					setOpen([]);
					setError(message(cause, "Could not read the pull requests"));
				},
			);
		},
	);

	// Merged and closed are read when asked for.
	createEffect(
		() =>
			[
				auth.token(),
				slug(),
				workspace.folders()[slug()],
				state(),
				revision(),
				othersLimit(),
			] as const,
		([token, project, folder, wanted, _rev, limit]) => {
			setOthers(null);
			setError(null);
			if (!token || !project || wanted === "open") return;
			if (!folder) return;
			void pullsService.list(token, project, "open", wanted, limit).then(
				(list) => {
					if (project === untrack(slug) && wanted === untrack(state)) setOthers(list);
				},
				(cause) => {
					if (project !== untrack(slug) || wanted !== untrack(state)) return;
					setOthers([]);
					setError(message(cause, "Could not read the pull requests"));
				},
			);
		},
	);

	const needsYou = createMemo(() => (open() ?? []).filter((pull) => waiting().has(pull.number)));
	const rest = createMemo(() => (open() ?? []).filter((pull) => !waiting().has(pull.number)));
	const who = (pull: PullSummary) => {
		const agent = agentOf(pull);
		return agent ? (
			<AgentLogo id={agent} name={agentName(agent, scope())} />
		) : (
			<Avatar name={pull.author} size="xs" />
		);
	};
	const panelRows = (list: readonly PullSummary[], waitingOnYou: boolean, closed?: string) => (
		<For each={list} keyed={(pull) => pull.number}>
			{(pull) => (
				<PullPanelRow
					href={href(pull().number)}
					title={pull().title}
					time={relativeTime(pull().updatedAt)}
					line={pullLine(pull())}
					tone={pullTone(pull(), waitingOnYou, closed)}
					who={who(pull())}
					current={number() === pull().number}
				/>
			)}
		</For>
	);
	const listRows = (list: readonly PullSummary[], waitingOnYou: boolean, closed?: string) => (
		<For each={list} keyed={(pull) => pull.number}>
			{(pull) => (
				<PullListRow
					href={href(pull().number)}
					title={pull().title}
					line={`#${pull().number} · ${madeBy(pull())} · ${relativeTime(pull().updatedAt)}`}
					tone={pullTone(pull(), waitingOnYou, closed)}
					who={who(pull())}
					checks={pull().checks}
				/>
			)}
		</For>
	);

	/** Why there is nothing to list: GitHub to connect, a folder to choose, or something else. */
	const problem = () => (
		<Show when={error()}>
			{(reason) => (
				<Show
					when={NEEDS_GITHUB.test(reason())}
					fallback={
						<Show
							when={NEEDS_FOLDER.test(reason())}
							fallback={
								<div class="p-2">
									<Alert
										tone="danger"
										title={reason()}
										action={
											<Button size="sm" onClick={() => setRevision((n) => n + 1)}>
												Try again
											</Button>
										}
									/>
								</div>
							}
						>
							<EmptyState
								icon={<PullRequestIcon size="md" />}
								title="Choose this project's folder"
								description="Pull requests come from the GitHub repository the folder pushes to."
								action={
									<Button size="sm" onClick={() => workspace.chooseFolderFor(slug())}>
										Choose folder
									</Button>
								}
							/>
						</Show>
					}
				>
					<EmptyState
						icon={<PullRequestIcon size="md" />}
						title="Connect GitHub"
						description="Review, merge and comment on pull requests from Grid."
						action={
							<TextLink tone="accent" href={workspaceHref("/settings/connectors")}>
								Open Connectors
							</TextLink>
						}
					/>
				</Show>
			)}
		</Show>
	);

	const loading = () => (
		<Stack gap={2} class="p-2">
			<Skeleton class="h-12" />
			<Skeleton class="h-12" />
			<Skeleton class="h-12" />
		</Stack>
	);
	const listing = () => !shell.desktop() && number() === null;
	const openCount = () => open()?.length ?? 0;

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="panelActions">
				<IconButton label="Refresh" size="sm" onClick={() => setRevision((n) => n + 1)}>
					<RestoreIcon size="sm" />
				</IconButton>
			</ShellSlot>
			{/* The panel: what waits on your review, then the rest open. */}
			<ShellSlot name="panel">
				<div class="px-2 pt-1 pb-2">
					<Segmented<PullState>
						block
						label="Which pull requests"
						value={state()}
						onChange={(value) => setSearch({ state: value === "open" ? undefined : value })}
						options={STATES.map((option) => ({
							...option,
							count: option.value === "open" && open() ? openCount() || undefined : undefined,
							countTone: "quiet" as const,
						}))}
					/>
				</div>
				{problem()}
				<Show
					when={state() === "open"}
					fallback={
						<Show when={others()} fallback={<Show when={!error()}>{loading()}</Show>}>
							{(list) => (
								<Show when={!error()}>
									<Show
										when={list().length}
										fallback={
											<Text size="caption" tone="subtle" class="px-2 py-2">
												{state() === "merged"
													? "No merged pull requests."
													: "No closed pull requests."}
											</Text>
										}
									>
										<PullGroupLabel>{state() === "merged" ? "Merged" : "Closed"}</PullGroupLabel>
										{panelRows(list(), false, state() === "merged" ? "MERGED" : "CLOSED")}
										<Show when={list().length >= othersLimit()}>
											<div class="flex flex-col gap-1 p-2">
												<Text size="caption" tone="subtle">
													Showing latest {list().length} pull requests. More exist on GitHub.
												</Text>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setOthersLimit((n) => n + 100)}
												>
													Load more
												</Button>
											</div>
										</Show>
									</Show>
								</Show>
							)}
						</Show>
					}
				>
					<Show when={open()} fallback={<Show when={!error()}>{loading()}</Show>}>
						<Show when={needsYou().length}>
							<PullGroupLabel>Needs your review</PullGroupLabel>
							{panelRows(needsYou(), true)}
						</Show>
						<Show when={rest().length}>
							<PullGroupLabel>Open</PullGroupLabel>
							{panelRows(rest(), false)}
						</Show>
						<Show when={!error() && openCount() === 0}>
							<Text size="caption" tone="subtle" class="px-2 py-2">
								No open pull requests.
							</Text>
						</Show>
						<Show when={open() && open()!.length >= openLimit()}>
							<div class="flex flex-col gap-1 p-2">
								<Text size="caption" tone="subtle">
									Showing latest {open()!.length} pull requests. More exist on GitHub.
								</Text>
								<Button size="sm" variant="ghost" onClick={() => setOpenLimit((n) => n + 100)}>
									Load more
								</Button>
							</div>
						</Show>
					</Show>
				</Show>
			</ShellSlot>
			<Show when={listing()}>
				<ShellSlot name="heading">
					<div class="flex min-w-0 flex-col items-center">
						<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
							Pull requests
						</Text>
						<Text size="caption" tone="subtle" truncate>
							{open() ? `${slug()} · ${openCount()} open` : slug()}
						</Text>
					</div>
				</ShellSlot>
			</Show>

			<Show
				when={number()}
				fallback={
					<Show
						when={listing()}
						fallback={
							<div class="grid min-h-0 flex-1 place-items-center p-4">
								<Show when={!error()} fallback={problem()}>
									<EmptyState
										icon={<PullRequestIcon size="md" />}
										title="Open a pull request"
										description="Its description, history, checks and changes show here."
									/>
								</Show>
							</div>
						}
					>
						{/* Phones: Open, Merged and Closed, what waits on you first. */}
						<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-6">
							<Segmented<PullState>
								block
								label="Which pull requests"
								value={state()}
								onChange={(value) => setSearch({ state: value === "open" ? undefined : value })}
								options={STATES.map((option) => ({
									...option,
									count: option.value === "open" && open() ? openCount() || undefined : undefined,
									countTone: "quiet" as const,
								}))}
							/>
							{problem()}
							<Show
								when={state() === "open"}
								fallback={
									<Show when={others()} fallback={<Show when={!error()}>{loading()}</Show>}>
										{(list) => (
											<Show when={!error()}>
												<Show
													when={list().length}
													fallback={
														<EmptyState
															icon={<PullRequestIcon size="md" />}
															title={state() === "merged" ? "Nothing merged yet" : "Nothing closed"}
														/>
													}
												>
													<div class="flex flex-col pt-2">
														{listRows(list(), false, state() === "merged" ? "MERGED" : "CLOSED")}
													</div>
													<Show when={list().length >= othersLimit()}>
														<div class="flex flex-col items-center gap-1 pt-4 pb-2">
															<Text size="caption" tone="subtle">
																Showing latest {list().length} pull requests. More exist on GitHub.
															</Text>
															<Button
																size="sm"
																variant="secondary"
																onClick={() => setOthersLimit((n) => n + 100)}
															>
																Load more
															</Button>
														</div>
													</Show>
												</Show>
											</Show>
										)}
									</Show>
								}
							>
								<Show when={open()} fallback={<Show when={!error()}>{loading()}</Show>}>
									<Show when={needsYou().length}>
										<PullGroupLabel phone>Needs your review</PullGroupLabel>
										{listRows(needsYou(), true)}
									</Show>
									<Show when={rest().length}>
										<PullGroupLabel phone>Open</PullGroupLabel>
										{listRows(rest(), false)}
									</Show>
									<Show when={!error() && openCount() === 0}>
										<EmptyState
											icon={<PullRequestIcon size="md" />}
											title="No open pull requests"
										/>
									</Show>
									<Show when={open() && open()!.length >= openLimit()}>
										<div class="flex flex-col items-center gap-1 pt-4 pb-2">
											<Text size="caption" tone="subtle">
												Showing latest {open()!.length} pull requests. More exist on GitHub.
											</Text>
											<Button
												size="sm"
												variant="secondary"
												onClick={() => setOpenLimit((n) => n + 100)}
											>
												Load more
											</Button>
										</div>
									</Show>
								</Show>
							</Show>
						</div>
					</Show>
				}
			>
				{(pull) => (
					<Show
						when={reviewing()}
						fallback={
							<PullDocument
								project={slug()}
								number={pull()}
								changesHref={href(pull(), "changes")}
								onBack={() => navigate(workspaceHref(`/pulls/${slug()}`))}
								onChanged={() => setRevision((n) => n + 1)}
							/>
						}
					>
						<PullChanges
							project={slug()}
							number={pull()}
							onBack={() => navigate(href(pull()))}
							onChanged={() => setRevision((n) => n + 1)}
						/>
					</Show>
				)}
			</Show>
		</div>
	);
}
