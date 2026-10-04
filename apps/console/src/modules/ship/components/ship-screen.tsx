import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Match, Show, Switch, untrack } from "solid-js";

import {
	Alert,
	Button,
	CloudIcon,
	EmptyState,
	IconButton,
	NoteAskDock,
	RestoreIcon,
	ShipGroupLabel,
	ShipListCard,
	ShipListRow,
	ShipPanelRow,
	Skeleton,
	Stack,
	Text,
	TextLink,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { draftsStore } from "@/modules/chat/stores/drafts";
import { useWorkspace } from "@/modules/projects";
import { ShellSlot, useShell } from "@/modules/shell";

import {
	envLine,
	envTitle,
	envTone,
	pipelineLine,
	pipelineTone,
	previewsLine,
	shipLine,
} from "../lib/ship-look";
import { shipService } from "../services/ship.service";
import type { ShipOverview } from "../types/ship.types";

import { EnvironmentView } from "./environment-view";
import { PipelineView } from "./pipeline-view";
import { PreviewsView } from "./previews-view";

const NEEDS_GITHUB = /connect github|auth login/i;
const NEEDS_FOLDER = /choose this project's folder/i;
const NO_REPO = /no github repository/i;

type Section = "env" | "previews" | "pipelines";

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * Ship (Figma 19): a project's environments, previews and pipelines in the panel, and the one
 * open beside it — `/ship/grid/env/production`, `/ship/grid/previews`, `/ship/grid/pipelines/142`.
 * Phones list them first; desktop opens production.
 */
export function ShipScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const shell = useShell();
	const navigate = useNavigate();
	const match = useMatch(() => "/ship/:slug/:section?/:name?");
	const slug = () => match()?.params.slug ?? "";
	const section = (): Section | null => {
		const value = match()?.params.section;
		return value === "env" || value === "previews" || value === "pipelines" ? value : null;
	};
	const name = () => {
		try {
			return decodeURIComponent(match()?.params.name ?? "");
		} catch {
			return "";
		}
	};
	const href = (path: string) => workspaceHref(`/ship/${slug()}${path}`);
	const envHref = (env: string) => href(`/env/${encodeURIComponent(env)}`);

	const [overview, setOverview] = createSignal<ShipOverview | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [revision, setRevision] = createSignal(0);
	const [ask, setAsk] = createSignal("");

	createEffect(
		() => [auth.token(), slug(), workspace.folders()[slug()], revision()] as const,
		([token, project]) => {
			setError(null);
			if (!token || !project) return;
			void shipService.overview(token, project).then(
				(next) => {
					if (project === untrack(slug)) setOverview(next);
				},
				(cause) => {
					if (project !== untrack(slug)) return;
					setOverview(null);
					setError(message(cause, "Could not read Ship"));
				},
			);
		},
	);

	// Desktop always has something open: production (or the first environment), else main's checks.
	createEffect(
		() => [shell.desktop(), section(), overview(), slug()] as const,
		([desktop, open, current, project]) => {
			if (!desktop || open || !current || current.repository === "" || !project) return;
			const first = current.environments[0];
			navigate(
				first
					? `/ship/${project}/env/${encodeURIComponent(first.name)}`
					: `/ship/${project}/pipelines/main`,
				{ replace: true },
			);
		},
	);

	const back = () => navigate(href(""));
	const changed = () => setRevision((n) => n + 1);

	const problem = () => (
		<Show when={error()}>
			{(reason) => (
				<Switch
					fallback={
						<div class="p-2">
							<Alert
								tone="danger"
								title={reason()}
								action={
									<Button size="sm" onClick={changed}>
										Try again
									</Button>
								}
							/>
						</div>
					}
				>
					<Match when={NEEDS_FOLDER.test(reason())}>
						<EmptyState
							icon={<CloudIcon size="md" />}
							title="Choose this project's folder"
							description="Ship reads the GitHub repository the folder pushes to."
							action={
								<Button size="sm" onClick={() => workspace.chooseFolderFor(slug())}>
									Choose folder
								</Button>
							}
						/>
					</Match>
					<Match when={NEEDS_GITHUB.test(reason())}>
						<EmptyState
							icon={<CloudIcon size="md" />}
							title="Connect GitHub"
							description="Deploys, checks and previews come from GitHub."
							action={
								<TextLink tone="accent" href={workspaceHref("/settings/connectors")}>
									Open Connectors
								</TextLink>
							}
						/>
					</Match>
					<Match when={NO_REPO.test(reason())}>
						<EmptyState
							icon={<CloudIcon size="md" />}
							title="This folder is not on GitHub"
							description="Ship follows deploys and checks through the GitHub repository a folder pushes to."
						/>
					</Match>
				</Switch>
			)}
		</Show>
	);

	const loading = () => (
		<Stack gap={2} class="p-2">
			<Skeleton class="h-11" />
			<Skeleton class="h-11" />
			<Skeleton class="h-11" />
		</Stack>
	);

	const current = (kind: Section, value: string) => section() === kind && name() === value;

	const sendAsk = () => {
		const text = ask().trim();
		if (!text || !slug()) return;
		draftsStore.set(slug(), text);
		setAsk("");
		navigate(workspaceHref(`/chat/${slug()}`));
	};

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="panelActions">
				<IconButton label="Refresh" size="sm" onClick={changed}>
					<RestoreIcon size="sm" />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="panel">
				{problem()}
				<Show when={overview()} fallback={<Show when={!error()}>{loading()}</Show>}>
					{(ship) => (
						<>
							<ShipGroupLabel>Environments</ShipGroupLabel>
							<For each={ship().environments}>
								{(env) => (
									<ShipPanelRow
										href={envHref(env.name)}
										title={envTitle(env.name)}
										line={envLine(env)}
										tone={envTone(env)}
										current={current("env", env.name)}
									/>
								)}
							</For>
							<ShipPanelRow
								href={href("/previews")}
								title="Previews"
								line={previewsLine(ship().previews)}
								tone="neutral"
								current={section() === "previews"}
							/>
							<ShipGroupLabel>Pipelines</ShipGroupLabel>
							<For each={ship().pipelines}>
								{(pipeline) => (
									<ShipPanelRow
										href={href(`/pipelines/${pipeline.id}`)}
										title={pipeline.label}
										line={pipelineLine(pipeline)}
										tone={pipelineTone(pipeline)}
										current={current("pipelines", pipeline.id)}
									/>
								)}
							</For>
						</>
					)}
				</Show>
			</ShellSlot>

			<Switch
				fallback={
					<Show
						when={!shell.desktop()}
						fallback={
							<div class="grid min-h-0 flex-1 place-items-center p-4">
								<Show when={error()} fallback={<Skeleton class="h-40 w-full max-w-xl" />}>
									{problem()}
								</Show>
							</div>
						}
					>
						{/* Phones: environments, pipelines, then asking an agent to ship. */}
						<ShellSlot name="heading">
							<div class="flex min-w-0 flex-col items-center">
								<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
									Ship
								</Text>
								<Text size="caption" tone="subtle" truncate>
									{overview() ? shipLine(overview() as ShipOverview) : slug()}
								</Text>
							</div>
						</ShellSlot>
						<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
							{problem()}
							<Show when={overview()} fallback={<Show when={!error()}>{loading()}</Show>}>
								{(ship) => (
									<>
										<ShipGroupLabel phone>Environments</ShipGroupLabel>
										<ShipListCard>
											<For each={ship().environments}>
												{(env) => (
													<ShipListRow
														href={envHref(env.name)}
														title={envTitle(env.name)}
														line={envLine(env)}
														tone={envTone(env)}
														action={
															env.kind === "staging" && env.ahead ? (
																<Button
																	size="sm"
																	variant="primary"
																	onClick={() => {
																		const production = ship().environments.find(
																			(item) => item.kind === "production",
																		);
																		if (production) navigate(envHref(production.name));
																	}}
																>
																	Promote
																</Button>
															) : undefined
														}
													/>
												)}
											</For>
											<ShipListRow
												href={href("/previews")}
												title="Previews"
												line={previewsLine(ship().previews)}
												tone="neutral"
											/>
										</ShipListCard>
										<ShipGroupLabel phone>Pipelines</ShipGroupLabel>
										<ShipListCard>
											<For each={ship().pipelines}>
												{(pipeline) => (
													<ShipListRow
														href={href(`/pipelines/${pipeline.id}`)}
														title={pipeline.label}
														line={pipelineLine(pipeline)}
														tone={pipelineTone(pipeline)}
													/>
												)}
											</For>
										</ShipListCard>
									</>
								)}
							</Show>
						</div>
						<NoteAskDock
							label="Ask an agent to ship something"
							placeholder="Ask an agent to ship something…"
							value={ask()}
							onInput={setAsk}
							onSubmit={sendAsk}
						/>
					</Show>
				}
			>
				<Match when={section() === "env" && name()}>
					<EnvironmentView project={slug()} name={name()} onChanged={changed} onBack={back} />
				</Match>
				<Match when={section() === "previews"}>
					<PreviewsView project={slug()} onBack={back} />
				</Match>
				<Match when={section() === "pipelines" && name()}>
					<PipelineView project={slug()} id={name()} onChanged={changed} onBack={back} />
				</Match>
			</Switch>
		</div>
	);
}
