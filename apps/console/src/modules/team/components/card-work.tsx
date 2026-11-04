import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, onCleanup, Show, untrack } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import {
	Button,
	ButtonLink,
	CheckIcon,
	ChevronRightIcon,
	Input,
	notify,
	RoleMark,
	StatusDot,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import type { Role } from "@/modules/chat/types/chat.types";

import { duration, isOpen, RUN_STATE } from "../lib/run-state";
import { teamService } from "../services/team.service";
import type { CardInput, TeammateRun } from "../types/team.types";

/** How often an open card reads its teammate's work again. */
const REFRESH_MS = 10_000;

/**
 * A card's teammate at work (the task panel): who has it, where it stands, and the one thing to do
 * next: Start, approve its plan (with a note), retry, or stop. A card handed from one teammate to
 * the next shows the relay, oldest first. Read again every few seconds while it is open, and
 * whenever `bump` changes (the card was just given to a teammate).
 */
export function CardWork(props: {
	project: string;
	card: CardInput;
	/** The teammate the card is assigned to, when it is one. */
	teammate: Role | null;
	team: readonly Role[];
	scope: string;
	bump?: number;
}): JSX.Element {
	const auth = useAuth();
	const [runs, setRuns] = createSignal<TeammateRun[] | null>(null);
	const [note, setNote] = createSignal("");
	const [busy, setBusy] = createSignal(false);

	async function read(): Promise<void> {
		// Read outside any tracking: from the effect below and from the timer alike.
		const [token, project, number, scope] = untrack(
			() => [auth.token(), props.project, props.card.number, props.scope] as const,
		);
		if (!token) return;
		const next = await teamService.runs(token, { project, task: number }, scope).catch(() => null);
		if (next) setRuns([...next].reverse());
	}
	createEffect(
		() => [props.project, props.card.number, props.scope, props.bump ?? 0] as const,
		() => void read(),
	);
	const timer = setInterval(() => void read(), REFRESH_MS);
	onCleanup(() => clearInterval(timer));

	const latest = () => (runs() ?? []).at(-1) ?? null;
	const nameOf = (id: string) => props.team.find((item) => item.id === id);
	/** The latest run is this teammate's own, or it has none open: it can be started. */
	const startable = () => props.teammate !== null && !(runs() ?? []).some((run) => isOpen(run));

	async function act(
		run: (token: string) => Promise<unknown>,
		done: string,
		after?: () => void,
	): Promise<void> {
		const token = untrack(auth.token);
		if (!token || busy()) return;
		setBusy(true);
		try {
			await run(token);
			notify({ title: done });
			after?.();
			await read();
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "That did not work",
				tone: "danger",
			});
		} finally {
			setBusy(false);
		}
	}

	return (
		<Show when={props.teammate || (runs()?.length ?? 0) > 0}>
			<section aria-label="Teammate work" class="surface-card flex flex-col gap-4 p-4">
				<Show when={props.teammate}>
					{(mate) => (
						<div class="flex items-center gap-3">
							<RoleMark icon={mate().icon} />
							<div class="flex min-w-0 flex-1 flex-col">
								<a
									href={workspaceHref(`/team/${mate().id}`)}
									class="focus-ring truncate font-medium text-body text-fg hover:underline"
								>
									{mate().name}
								</a>
								<Text size="caption" tone="subtle" truncate>
									{mate().specialty || "Teammate"} ·{" "}
									{mate().planFirst ? "plans first, then works" : "works straight away"} in its own
									worktree
								</Text>
							</div>
							<Show when={latest()}>
								{(run) => (
									<span class="flex shrink-0 items-center gap-1.5 text-caption text-fg-subtle">
										<StatusDot status={RUN_STATE[run().state].dot} />
										{RUN_STATE[run().state].label}
									</span>
								)}
							</Show>
						</div>
					)}
				</Show>

				{/* The relay: each teammate that has had the card, in order. */}
				<Show when={(runs()?.length ?? 0) > 1}>
					<div class="flex flex-wrap items-center gap-1.5">
						<For each={runs() ?? []}>
							{(run, index) => (
								<>
									<Show when={index() > 0}>
										<ChevronRightIcon size="xs" class="text-fg-faint" />
									</Show>
									<span class="flex items-center gap-1.5 text-caption text-fg-subtle">
										<RoleMark icon={nameOf(run.teammateId)?.icon ?? "code"} size="sm" />
										{nameOf(run.teammateId)?.name ?? "A teammate"}
										<span class="text-fg-faint">· {RUN_STATE[run.state].label}</span>
									</span>
								</>
							)}
						</For>
					</div>
				</Show>

				<Show when={latest()}>
					{(run) => (
						<div class="flex flex-col gap-3">
							<Text size="caption" tone={run().state === "needs_you" ? "danger" : "subtle"}>
								{run().state === "plan_ready"
									? `${nameOf(run().teammateId)?.name ?? "It"} wrote a plan. Read it in the thread, then approve it to start.`
									: run().state === "needs_you"
										? (run().error ?? "It got stuck.")
										: run().state === "review"
											? `Done in ${duration((Date.parse(run().endedAt ?? run().updatedAt) - Date.parse(run().createdAt)) / 60_000)}${run().branch ? ` on ${run().branch}` : ""}: ready for review.`
											: run().state === "queued"
												? "Up next: it starts when one of its other cards is done."
												: run().state === "stopped"
													? "Stopped."
													: `${RUN_STATE[run().state].label} on ${run().branch ?? "its worktree"}.`}
							</Text>
							<Show when={run().state === "plan_ready"}>
								<Input
									aria-label="A note with the approval"
									placeholder="A note with the approval (optional): “Skip the migration for now”"
									value={note()}
									maxlength={2000}
									onInput={(event) => setNote(event.currentTarget.value)}
								/>
							</Show>
							<div class="flex flex-wrap items-center gap-2">
								<Show when={run().sessionId}>
									<ButtonLink
										href={workspaceHref(`/chat/${run().project}/${run().sessionId}`)}
										size="sm"
										variant={run().state === "plan_ready" ? "secondary" : "ghost"}
									>
										{run().state === "plan_ready" ? "Read the plan" : "Open thread"}
									</ButtonLink>
								</Show>
								<Show when={run().state === "plan_ready"}>
									<Button
										size="sm"
										variant="primary"
										icon={<CheckIcon />}
										disabled={busy()}
										onClick={() =>
											void act(
												(token) => teamService.approve(token, run().id, note(), props.scope),
												"Plan approved",
												() => setNote(""),
											)
										}
									>
										Approve plan
									</Button>
								</Show>
								<Show when={run().state === "needs_you" || run().state === "stopped"}>
									<Button
										size="sm"
										variant="primary"
										disabled={busy()}
										onClick={() =>
											void act(
												(token) => teamService.retry(token, run().id, props.scope),
												"Trying again",
											)
										}
									>
										Retry
									</Button>
								</Show>
								<Show when={isOpen(run())}>
									<Button
										size="sm"
										variant="ghost"
										disabled={busy()}
										onClick={() =>
											void act((token) => teamService.stop(token, run().id, props.scope), "Stopped")
										}
									>
										Stop
									</Button>
								</Show>
							</div>
						</div>
					)}
				</Show>

				<Show
					when={startable() && latest()?.state !== "needs_you" && latest()?.state !== "stopped"}
				>
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Text size="caption" tone="subtle" class="min-w-0 flex-1">
							{latest()
								? "Give it the card again to start a new round."
								: `${props.teammate?.name} has not started on this card.`}
						</Text>
						<Button
							size="sm"
							variant="primary"
							disabled={busy()}
							onClick={() => {
								const mate = props.teammate;
								if (!mate) return;
								void act(
									(token) =>
										teamService.start(token, mate.id, props.project, props.card, props.scope),
									`${mate.name} is on ${props.card.key}`,
								);
							}}
						>
							Start {props.teammate?.name}
						</Button>
					</div>
				</Show>
			</section>
		</Show>
	);
}
