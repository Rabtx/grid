import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import {
	Alert,
	BackIcon,
	Badge,
	Button,
	ButtonLink,
	EmptyState,
	GlobeIcon,
	IconButton,
	notify,
	PreviewCard,
	PreviewGrid,
	ShipHeading,
	ShipPage,
	Skeleton,
	Text,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { agentName } from "@/modules/chat/stores/providers";
import { placementsStore } from "@/modules/environments";
import { useWorkspace } from "@/modules/projects";
import { ShellSlot } from "@/modules/shell";

import { startPullThread } from "../lib/pull-thread";
import { ago, bareUrl, plural, previewTone } from "../lib/ship-look";
import { shipService } from "../services/ship.service";
import type { Preview } from "../types/ship.types";

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/** What an agent is asked when it tests a preview. */
export function testPrompt(preview: Preview): string {
	return [
		`Test the preview of pull request #${preview.number} "${preview.title}" at ${preview.url}.`,
		"Open it, try what this pull request changes the way a person would, and check nothing nearby broke.",
		"Report what works and what does not, with the steps to see each problem. Change no code unless asked.",
	].join("\n\n");
}

/**
 * Previews (Figma 19 · Previews): one live link per open pull request, as the host posted it, with
 * the thread on its branch or a way to ask an agent to test it.
 */
export function PreviewsView(props: { project: string; onBack: () => void }): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const scope = () => placementsStore.scopeOf(props.project);
	const [previews, setPreviews] = createSignal<Preview[] | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [revision, setRevision] = createSignal(0);
	const [starting, setStarting] = createSignal<number | null>(null);

	createEffect(
		() => [auth.token(), props.project, revision()] as const,
		([token, project]) => {
			setError(null);
			if (!token) return;
			void shipService.previews(token, project).then(
				(next) => {
					if (project === untrack(() => props.project)) setPreviews(next);
				},
				(cause) => {
					setPreviews(null);
					setError(message(cause, "Could not read the previews"));
				},
			);
		},
	);

	// One still building is checked again until it is up.
	createEffect(
		() => Boolean(previews()?.some((preview) => preview.state === "building")),
		(building) => {
			if (!building) return;
			const timer = setInterval(() => setRevision((n) => n + 1), 15_000);
			return () => clearInterval(timer);
		},
	);

	async function askToTest(preview: Preview): Promise<void> {
		const token = auth.token();
		const folder = workspace.folders()[props.project];
		if (!token || !folder || starting() !== null) return;
		setStarting(preview.number);
		try {
			const id = await startPullThread(token, props.project, folder, preview, testPrompt(preview));
			navigate(workspaceHref(`/chat/${props.project}/${id}`));
		} catch (cause) {
			notify({ title: message(cause, "Could not start the thread"), tone: "danger" });
		} finally {
			setStarting(null);
		}
	}

	const badge = (preview: Preview) => {
		if (preview.state === "building")
			return (
				<Badge tone="accent" dot>
					Building
				</Badge>
			);
		if (preview.state === "failed")
			return (
				<Badge tone="danger" dot>
					Failed
				</Badge>
			);
		if (preview.state === "none") return <Badge>No preview</Badge>;
		return (
			<Badge tone="success" dot>
				Ready
			</Badge>
		);
	};

	const note = (preview: Preview) => {
		if (preview.state === "building") return "Building";
		if (preview.state === "failed") return "The host could not build it";
		if (preview.state === "none") return "The host posted no preview for it";
		if (preview.thread)
			return `${agentName(preview.thread.provider, scope())} · ${preview.thread.title}`;
		return `Not tested yet · up ${ago(preview.at)}`;
	};

	const live = () => previews()?.filter((preview) => preview.state === "ready").length ?? 0;

	return (
		<>
			<ShellSlot name="crumb">Previews</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						Previews
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{previews() ? `${live()} live` : "Ship"}
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="leading">
				<IconButton label="Ship" variant="secondary" shape="round" size="lg" onClick={props.onBack}>
					<BackIcon />
				</IconButton>
			</ShellSlot>

			<ShipPage>
				<ShipHeading
					title="Previews"
					meta={`One live link per open pull request${previews() ? ` · ${plural(previews()?.length ?? 0, "open pull request")}` : ""}`}
				/>
				<Show when={error()}>
					{(reason) => (
						<Alert
							tone="danger"
							title={reason()}
							action={
								<Button size="sm" onClick={() => setRevision((n) => n + 1)}>
									Try again
								</Button>
							}
						/>
					)}
				</Show>
				<Show
					when={previews()}
					fallback={
						<Show when={!error()}>
							<PreviewGrid>
								<Skeleton class="h-72" />
								<Skeleton class="h-72" />
							</PreviewGrid>
						</Show>
					}
				>
					{(list) => (
						<Show
							when={list().length}
							fallback={
								<EmptyState
									icon={<GlobeIcon size="md" />}
									title="No open pull requests"
									description="When your host posts a deployment for a pull request (Vercel, Netlify, Render and others do), its preview shows here."
								/>
							}
						>
							<PreviewGrid>
								<For each={list()}>
									{(preview) => (
										<PreviewCard
											title={`#${preview.number} · ${preview.title}`}
											url={bareUrl(preview.url)}
											badge={badge(preview)}
											note={note(preview)}
											tone={previewTone(preview)}
											actions={
												<>
													<Show when={preview.state === "ready" && preview.url && !preview.thread}>
														<Button
															size="sm"
															disabled={starting() !== null}
															onClick={() => void askToTest(preview)}
														>
															Ask an agent to test
														</Button>
													</Show>
													<Show when={preview.thread}>
														{(thread) => (
															<ButtonLink
																size="sm"
																variant="ghost"
																href={workspaceHref(`/chat/${props.project}/${thread().id}`)}
															>
																Open thread
															</ButtonLink>
														)}
													</Show>
													<Show
														when={preview.url}
														fallback={
															<ButtonLink
																size="sm"
																variant="ghost"
																href={preview.pullUrl}
																target="_blank"
																rel="noreferrer"
															>
																Pull request
															</ButtonLink>
														}
													>
														{(url) => (
															<ButtonLink
																size="sm"
																variant="ghost"
																href={url()}
																target="_blank"
																rel="noreferrer"
															>
																Open
															</ButtonLink>
														)}
													</Show>
												</>
											}
										/>
									)}
								</For>
							</PreviewGrid>
						</Show>
					)}
				</Show>
			</ShipPage>
		</>
	);
}
