import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	Badge,
	Button,
	Dialog,
	Field,
	Select,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Stack,
	Switch,
	Text,
	Textarea,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { placementsStore } from "@/modules/environments";
import { relativeTime } from "@/modules/projects/lib/relative-time";

import {
	type AgentReview,
	type ProjectReviews,
	type ReviewSettingsInput,
	reviewsService,
} from "../services/reviews.service";

const STATUS: Record<
	AgentReview["status"],
	{ tone: "neutral" | "success" | "danger"; label: string }
> = {
	running: { tone: "neutral", label: "Reviewing" },
	posted: { tone: "success", label: "Posted" },
	failed: { tone: "danger", label: "Failed" },
};

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * A project's review agent: on, every pull request opened or pushed to gets a review from the
 * agent chosen here, posted on GitHub as a comment, once per commit. Owners and admins turn it on
 * and say what reviews should look for; everyone sees the latest reviews and opens their threads.
 */
export function ReviewsDialog(props: {
	open: boolean;
	project: string;
	onClose: () => void;
}): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const scope = () => placementsStore.scopeOf(props.project);
	const [shown, setShown] = createSignal<ProjectReviews | null>(null);
	const [draft, setDraft] = createSignal<ReviewSettingsInput | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [saving, setSaving] = createSignal(false);

	const agents = () => offeredProviders(providersStore.providers(scope()));

	async function load(token = auth.token()): Promise<void> {
		if (!token) return;
		try {
			const next = await reviewsService.get(token, props.project);
			setShown(next);
			setDraft({
				enabled: next.settings?.enabled ?? false,
				provider: next.settings?.provider ?? agents()[0]?.id ?? "",
				model: next.settings?.model ?? null,
				instructions: next.settings?.instructions ?? null,
			});
			setError(null);
		} catch (cause) {
			setError(message(cause, "Could not read this project's reviews"));
		}
	}

	createEffect(
		() => [props.open, auth.token(), scope()] as const,
		([open, token, where]) => {
			if (!open || !token) return;
			void providersStore.load(token, where).then(() => {
				// The agent shown before any is saved is the first this machine has.
				const current = draft();
				if (current && !current.provider && agents()[0])
					setDraft({ ...current, provider: agents()[0]?.id ?? "" });
			});
			void load(token);
		},
	);

	const change = (patch: Partial<ReviewSettingsInput>) =>
		setDraft((current) => (current ? { ...current, ...patch } : current));

	async function save(): Promise<void> {
		const token = auth.token();
		const input = draft();
		if (!token || !input) return;
		setSaving(true);
		try {
			await reviewsService.save(token, props.project, input);
			await load();
		} catch (cause) {
			setError(message(cause, "Could not save the review agent"));
		} finally {
			setSaving(false);
		}
	}

	const canManage = () => shown()?.canManage === true;

	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			title="Review agent"
			description="Every pull request opened or pushed to gets an agent's review, posted on GitHub as a comment. Each commit is reviewed once."
			width="34rem"
			footer={
				<Show
					when={canManage()}
					fallback={
						<Button variant="ghost" onClick={props.onClose}>
							Done
						</Button>
					}
				>
					<Button variant="ghost" onClick={props.onClose}>
						Cancel
					</Button>
					<Button disabled={saving() || !draft()?.provider} onClick={() => void save()}>
						Save
					</Button>
				</Show>
			}
		>
			<Stack gap={4}>
				<Show when={error()}>{(text) => <Alert tone="danger" title={text()} />}</Show>
				<Show
					when={shown() && draft()}
					fallback={
						<Show when={!error()}>
							<Stack gap={2}>
								<Skeleton class="h-12" />
								<Skeleton class="h-12" />
							</Stack>
						</Show>
					}
				>
					<SettingsGroup title="Reviews" plain>
						<SettingsRow
							label="Review every pull request"
							description={
								canManage()
									? "Drafts are left until they are ready. Ones already open are reviewed when they are next pushed to."
									: "Owners and admins turn this on."
							}
						>
							<Switch
								label="Review every pull request"
								checked={draft()?.enabled ?? false}
								disabled={!canManage()}
								onChange={(enabled) => change({ enabled })}
							/>
						</SettingsRow>
					</SettingsGroup>
					<Field label="Agent">
						{() => (
							<Select
								label="Agent"
								look="field"
								disabled={!canManage()}
								value={draft()?.provider ?? ""}
								onChange={(provider) => change({ provider, model: null })}
								groups={[
									{
										options: agents().map((agent) => ({ value: agent.id, label: agent.name })),
									},
								]}
							/>
						)}
					</Field>
					<Field
						label="What reviews look for"
						hint="Besides bugs, security and missing tests: this project's own rules, in a few lines."
					>
						{(id) => (
							<Textarea
								id={id}
								rows={3}
								maxlength={2000}
								disabled={!canManage()}
								placeholder="Money is in cents, never floats. Every route checks the workspace."
								value={draft()?.instructions ?? ""}
								onInput={(event) => change({ instructions: event.currentTarget.value || null })}
							/>
						)}
					</Field>
					<SettingsGroup title="Latest reviews" plain>
						<Show
							when={shown()?.reviews.length}
							fallback={
								<Text size="caption" tone="subtle">
									None yet. A pull request's menu has "Review with the agent" to ask for one now.
								</Text>
							}
						>
							<For each={shown()?.reviews ?? []}>
								{(review) => (
									<SettingsRow
										label={`#${review.number} ${review.title}`}
										description={
											review.status === "failed"
												? (review.error ?? "It failed")
												: `${review.head.slice(0, 7)} · ${relativeTime(review.at)}${review.manual ? " · asked for" : ""}`
										}
									>
										<Badge tone={STATUS[review.status].tone}>{STATUS[review.status].label}</Badge>
										<Show when={review.commentUrl}>
											{(url) => (
												<Button
													size="sm"
													variant="ghost"
													onClick={() => window.open(url(), "_blank", "noopener")}
												>
													On GitHub
												</Button>
											)}
										</Show>
										<Show when={review.sessionId}>
											{(id) => (
												<Button
													size="sm"
													variant="ghost"
													onClick={() => {
														props.onClose();
														navigate(`/chat/${props.project}/${id()}`);
													}}
												>
													Thread
												</Button>
											)}
										</Show>
									</SettingsRow>
								)}
							</For>
						</Show>
					</SettingsGroup>
				</Show>
			</Stack>
		</Dialog>
	);
}
