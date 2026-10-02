import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { Alert, Button, Dialog, Skeleton, Spinner, Stack, Switch, Text, Textarea } from "@/kit";
import { useAuth } from "@/modules/auth";
import { queueFirstMessage } from "@/modules/chat/components/conversation";
import { ModelPicker } from "@/modules/chat/components/pickers";
import { chatService } from "@/modules/chat/services/chat.service";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { threadsStore } from "@/modules/chat/stores/threads";
import { placementsStore } from "@/modules/environments";
import { notesStore, useWorkspace } from "@/modules/projects";

import { pullsService } from "../services/pulls.service";
import type { FixInclude, FixPlan } from "../types/github.types";

const INCLUDES: { key: keyof FixInclude; label: string; hint: string }[] = [
	{ key: "checks", label: "Failing checks", hint: "With the last lines of their logs" },
	{ key: "comments", label: "Review comments", hint: "The ones still unresolved" },
	{ key: "description", label: "Description", hint: "What the pull request says it does" },
];

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * "Fix with an agent": one short sheet before a thread starts on a pull request. Pick the agent and
 * model, what the first message carries (the failing checks and their logs, the unresolved review
 * comments, the description — read by the runner, which has `gh`), then that message itself, which
 * is editable. The thread works in a worktree on the pull request's own branch, never the project's
 * checkout, and the screen moves to it.
 */
export function FixWithAgentSheet(props: {
	open: boolean;
	project: string;
	number: number;
	onClose: () => void;
	/** A thread was started, so the pull request can show it. */
	onStarted: () => void;
}): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const scope = () => placementsStore.scopeOf(props.project);
	const folder = () => workspace.folders()[props.project];

	const [include, setInclude] = createSignal<FixInclude>({
		checks: true,
		comments: true,
		description: true,
	});
	const [plan, setPlan] = createSignal<FixPlan | null>(null);
	const [draft, setDraft] = createSignal("");
	const [reading, setReading] = createSignal(false);
	const [starting, setStarting] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	// The agents on the machine this project runs on; the sheet shows what it has already read.
	createEffect(
		() => [props.open, auth.token(), props.project] as const,
		([open, token]) => {
			if (open && token) void providersStore.load(token, scope());
		},
	);

	// The plan is the runner's: it reads the checks, their logs and the comments. It is read again
	// whenever the sheet opens or the includes change; only the newest answer counts, and it
	// rewrites the message only while the person has not edited it.
	let asked = 0;
	const [edited, setEdited] = createSignal(false);
	createEffect(
		() => [props.open, auth.token(), props.project, props.number, include()] as const,
		([open, token, project, number, wanted]) => {
			if (!open) {
				setEdited(false);
				return;
			}
			if (!token) return;
			const ask = ++asked;
			setReading(true);
			setError(null);
			pullsService
				.fix(token, project, number, wanted)
				.then((next) => {
					if (ask !== asked) return;
					setPlan(next);
					if (!edited()) setDraft(next.message);
				})
				.catch((cause) => {
					if (ask === asked)
						setError(message(cause, "Could not read this pull request's failures"));
				})
				.finally(() => {
					if (ask === asked) setReading(false);
				});
		},
	);

	const available = () => offeredProviders(providersStore.providers(scope()));
	const [picked, setPicked] = createSignal<string | null>(null);
	const chosen = () => available().find((provider) => provider.id === picked()) ?? available()[0];
	const models = () => chosen()?.models ?? [];
	const [pickedModel, setPickedModel] = createSignal<string | null>(null);
	const model = createMemo(() => {
		if (!chosen()) return null;
		const wanted = pickedModel() ?? chosen()?.settings?.model ?? null;
		return models().find((item) => item.id === wanted)?.id ?? models()[0]?.id ?? null;
	});
	const efforts = () => models().find((item) => item.id === model())?.efforts ?? [];
	const [pickedEffort, setPickedEffort] = createSignal<string | null>(null);
	const effort = () => {
		const wanted = pickedEffort();
		return (
			efforts().find((level) => level.id === wanted)?.id ??
			models().find((item) => item.id === model())?.defaultEffort ??
			null
		);
	};

	const ready = () => Boolean(plan() && chosen() && folder() && draft().trim());

	/** Start the thread: a worktree on the pull request's branch, with the message as its first. */
	async function start(): Promise<void> {
		const token = auth.token();
		const provider = chosen();
		const branch = plan()?.branch;
		const where = folder();
		if (!token || !provider || !branch || !where || starting()) return;
		setStarting(true);
		setError(null);
		try {
			const session = await chatService.create(
				token,
				{
					project: props.project,
					provider: provider.id,
					// The project's folder is where the runner makes the branch's worktree from.
					cwd: where,
					model: model() ?? undefined,
					effort: effort() ?? undefined,
					mode: provider.settings?.mode,
					// The pull request's own branch, checked out as it is, in a worktree of its own.
					worktree: true,
					branch,
					existing: true,
					pull: props.number,
					fork: plan()?.fork ?? false,
					notes: await notesStore.sharedText(token, props.project),
				},
				scope(),
			);
			queueFirstMessage(session.id, draft().trim());
			threadsStore.upsert(session);
			props.onClose();
			props.onStarted();
			navigate(`/chat/${props.project}/${session.id}`);
		} catch (cause) {
			setError(message(cause, "Could not start the thread"));
		} finally {
			setStarting(false);
		}
	}

	return (
		<Dialog
			open={props.open}
			onClose={() => props.onClose()}
			title="Fix with an agent"
			description="The agent works in a worktree on this pull request's branch, not your checkout."
			width="34rem"
			footer={
				<>
					<Button onClick={() => props.onClose()}>Cancel</Button>
					<Button variant="primary" disabled={!ready() || starting()} onClick={() => void start()}>
						<Show when={starting()} fallback="Start thread">
							<Spinner /> Starting…
						</Show>
					</Button>
				</>
			}
		>
			<Stack gap={4}>
				<Show when={error()}>{(reason) => <Alert tone="danger" title={reason()} />}</Show>

				<Show
					when={folder()}
					fallback={
						<Alert tone="accent" title="This project has no folder on this machine">
							A thread works in the project's folder; choose it first.
						</Alert>
					}
				>
					<Stack gap={2}>
						<Text size="caption" tone="subtle">
							On the branch
						</Text>
						<Show when={plan()} fallback={<Skeleton class="h-5 w-40" />}>
							{(known) => (
								<Text weight="medium" mono truncate>
									{known().branch}
								</Text>
							)}
						</Show>
					</Stack>
				</Show>

				<Show when={chosen()} fallback={<Text tone="subtle">No agent is installed here.</Text>}>
					{(provider) => (
						<ModelPicker
							agents={available()}
							agent={provider().id}
							onAgent={setPicked}
							models={models()}
							model={model() ?? ""}
							onModel={setPickedModel}
							efforts={efforts()}
							effort={effort()}
							onEffort={setPickedEffort}
						/>
					)}
				</Show>

				<Stack gap={1}>
					<Text size="caption" weight="medium" tone="subtle">
						Include
					</Text>
					<For each={INCLUDES}>
						{(item) => (
							<div class="flex min-h-11 items-center gap-3">
								<div class="min-w-0 flex-1">
									<Text size="caption" weight="medium">
										{item.label}
									</Text>
									<Text size="caption" tone="subtle">
										{item.hint}
									</Text>
								</div>
								<Switch
									label={item.label}
									checked={include()[item.key]}
									onChange={(checked) => setInclude({ ...include(), [item.key]: checked })}
								/>
							</div>
						)}
					</For>
				</Stack>

				<Stack gap={1}>
					<Text size="caption" weight="medium" tone="subtle">
						First message
					</Text>
					<Show when={!reading()} fallback={<Skeleton class="h-40" />}>
						<Textarea
							aria-label="First message"
							rows={10}
							value={draft()}
							onInput={(event) => {
								setDraft(event.currentTarget.value);
								setEdited(true);
							}}
						/>
					</Show>
					<Text size="caption" tone="subtle">
						Turning an include off rewrites this from what is left.
					</Text>
				</Stack>
			</Stack>
		</Dialog>
	);
}
