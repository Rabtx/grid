import { useMatch, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	AlertIcon,
	Button,
	CheckCircleIcon,
	EmptyState,
	IconButton,
	ListDetail,
	ListRow,
	PaneHeader,
	PullRequestIcon,
	RestoreIcon,
	Segmented,
	Skeleton,
	SpinnerIcon,
	TextLink,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";
import { relativeTime } from "@/modules/projects/lib/relative-time";

import { pullSubtitle } from "../lib/pulls";
import { pullsService } from "../services/pulls.service";
import type { CheckState, PullFilter, PullSummary } from "../types/github.types";

import { PullDetailPane } from "./pull-detail";

const FILTERS = [
	{ value: "open", label: "Open" },
	{ value: "mine", label: "Mine" },
	{ value: "review", label: "To review" },
] as const satisfies readonly { value: PullFilter; label: string }[];

const NEEDS_GITHUB = /connect github/i;
const NEEDS_FOLDER = /choose this project's folder/i;

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/** A pull request's checks at a glance, as its row's icon. */
function ChecksIcon(props: { checks: CheckState }): JSX.Element {
	return (
		<Show
			when={props.checks !== "none"}
			fallback={<PullRequestIcon size="sm" class="text-fg-subtle" />}
		>
			<Show when={props.checks === "passing"}>
				<CheckCircleIcon size="sm" class="text-success" />
			</Show>
			<Show when={props.checks === "failing"}>
				<AlertIcon size="sm" class="text-danger" />
			</Show>
			<Show when={props.checks === "pending"}>
				<SpinnerIcon class="size-4 text-warning" />
			</Show>
		</Show>
	);
}

/**
 * A project's pull requests on GitHub: open ones, yours, or those waiting for your review, beside
 * the one open. The open one and the filter are in the URL (`?pr=12&filter=mine`), so a link or a
 * reload lands on it; on phones the pull request covers the list, with a way back.
 */
export function PullsScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const match = useMatch(() => "/pulls/:slug");
	const [search, setSearch] = useSearchParams<{ pr?: string; filter?: string }>();
	const slug = () => match()?.params.slug ?? "";
	const filter = (): PullFilter =>
		FILTERS.some((option) => option.value === search.filter)
			? (search.filter as PullFilter)
			: "open";
	const open = () => (search.pr ? Number(search.pr) : null);
	const [pulls, setPulls] = createSignal<PullSummary[] | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [revision, setRevision] = createSignal(0);

	async function load(): Promise<void> {
		const token = auth.token();
		const project = slug();
		const wanted = filter();
		if (!token || !project) return;
		setError(null);
		try {
			const list = await pullsService.list(token, project, wanted);
			if (project !== slug() || wanted !== filter()) return;
			setPulls(list);
		} catch (cause) {
			if (project !== slug()) return;
			setPulls([]);
			setError(message(cause, "Could not read the pull requests"));
		}
	}

	createEffect(
		() => [auth.token(), slug(), filter(), workspace.folders()[slug()], revision()] as const,
		() => {
			setPulls(null);
			void load();
		},
	);

	const list = (
		<>
			<PaneHeader
				title="Pull requests"
				actions={
					<IconButton label="Refresh" size="sm" onClick={() => setRevision((n) => n + 1)}>
						<RestoreIcon size="sm" />
					</IconButton>
				}
			/>
			<div class="shrink-0 px-2 pt-2 md:px-3">
				<Segmented
					block
					label="Which pull requests"
					options={FILTERS}
					value={filter()}
					onChange={(value) => setSearch({ filter: value === "open" ? undefined : value })}
				/>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto p-1.5 md:p-2">
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
				<Show
					when={pulls()}
					fallback={
						<div class="flex flex-col gap-1.5 p-1">
							<Skeleton class="h-12" />
							<Skeleton class="h-12" />
							<Skeleton class="h-12" />
						</div>
					}
				>
					{(loaded) => (
						<Show
							when={loaded().length > 0 || error()}
							fallback={
								<EmptyState
									icon={<PullRequestIcon size="md" />}
									title={
										filter() === "review"
											? "Nothing waiting for your review"
											: filter() === "mine"
												? "No open pull requests of yours"
												: "No open pull requests"
									}
								/>
							}
						>
							<For each={loaded()}>
								{(pull) => (
									<ListRow
										title={pull.draft ? `Draft: ${pull.title}` : pull.title}
										subtitle={pullSubtitle(pull)}
										trailing={relativeTime(pull.updatedAt)}
										icon={<ChecksIcon checks={pull.checks} />}
										current={open() === pull.number}
										onClick={() => setSearch({ pr: String(pull.number) })}
									/>
								)}
							</For>
						</Show>
					)}
				</Show>
			</div>
		</>
	);

	return (
		<ListDetail list={list} open={open() !== null}>
			<Show
				when={open()}
				fallback={
					<EmptyState
						icon={<PullRequestIcon size="md" />}
						title="Open a pull request"
						description="Its description, checks, conversation and changed files show here."
					/>
				}
			>
				{(number) => (
					<PullDetailPane
						project={slug()}
						number={number()}
						onBack={() => setSearch({ pr: undefined })}
						onChanged={() => setRevision((n) => n + 1)}
					/>
				)}
			</Show>
		</ListDetail>
	);
}
