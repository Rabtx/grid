import { useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Match, onCleanup, onSettled, Show, Switch } from "solid-js";

import {
	AgentMessage,
	Alert,
	Button,
	CheckIcon,
	EmptyState,
	Input,
	Prose,
	Skeleton,
	SpinnerIcon,
	Stack,
	Text,
	Textarea,
	UserMessage,
} from "@/kit";

import { type GuestEvent, guestBlocks, type GuestPage } from "../lib/guest-view";
import { renderMarkdown } from "../lib/markdown";

const POLL_MS = 3000;
const NAME_KEY = "grid:guest-name";

function remembered(): string {
	try {
		return localStorage.getItem(NAME_KEY) ?? "";
	} catch {
		return "";
	}
}

/** The runner, through this console, with no sign-in: the link's token is all a guest has. */
async function guestCall<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${window.location.origin}/runner/guest/${path}`, {
		...init,
		headers: init.body ? { "Content-Type": "application/json" } : {},
		referrerPolicy: "no-referrer",
	});
	const body = (await response.json().catch(() => null)) as { data?: T; message?: string } | null;
	if (!response.ok)
		throw Object.assign(new Error(body?.message ?? "Grid did not answer"), {
			status: response.status,
		});
	return body?.data as T;
}

/**
 * A thread shared with a guest (`/guest/<token>`): its conversation as it goes, with no sign-in,
 * and a box to ask something. What a guest asks waits for the thread's person, who sends it on to
 * the agent or not; the guest sees which.
 */
export function GuestScreen(): JSX.Element {
	const params = useParams<{ token: string }>();
	const [page, setPage] = createSignal<Omit<GuestPage, "events"> | null>(null);
	const [events, setEvents] = createSignal<GuestEvent[]>([]);
	const [ended, setEnded] = createSignal<string | null>(null);
	const [name, setName] = createSignal(remembered());
	const [text, setText] = createSignal("");
	const [sending, setSending] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const blocks = createMemo(() => guestBlocks(events()));
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	async function poll(): Promise<void> {
		const after = page()?.next;
		try {
			const next = await guestCall<GuestPage>(
				`${encodeURIComponent(params.token)}${after === undefined ? "" : `?after=${after}`}`,
			);
			setPage({
				title: next.title,
				running: next.running,
				expiresAt: next.expiresAt,
				next: next.next,
			});
			if (next.events.length) setEvents((current) => [...current, ...next.events]);
		} catch (cause) {
			if ((cause as { status?: number }).status === 404) {
				setEnded(cause instanceof Error ? cause.message : "This link has ended.");
				return;
			}
		}
		if (!stopped) timer = setTimeout(() => void poll(), POLL_MS);
	}

	onSettled(() => void poll());
	onCleanup(() => {
		stopped = true;
		clearTimeout(timer);
	});

	async function ask(): Promise<void> {
		const question = text().trim();
		if (!question || sending()) return;
		setSending(true);
		setError(null);
		try {
			localStorage.setItem(NAME_KEY, name().trim());
		} catch {
			// Not remembered on this device; asked again next time.
		}
		try {
			await guestCall(`${encodeURIComponent(params.token)}/messages`, {
				method: "POST",
				body: JSON.stringify({ name: name().trim(), text: question }),
			});
			setText("");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Not sent");
		} finally {
			setSending(false);
		}
	}

	return (
		<div class="flex min-h-dvh flex-col bg-surface pt-safe text-fg">
			<Show
				when={!ended()}
				fallback={
					<main class="flex flex-1 items-center justify-center p-4">
						<EmptyState title="This link has ended" description={ended() ?? undefined} />
					</main>
				}
			>
				<header class="sticky top-0 z-10 border-line border-b bg-surface/90 px-4 py-3 backdrop-blur">
					<div class="mx-auto flex w-full max-w-3xl items-center gap-2">
						<Show when={page()} fallback={<Skeleton class="h-6 w-48" />}>
							{(shown) => (
								<>
									<h1 class="min-w-0 flex-1 truncate font-medium text-body-lg">{shown().title}</h1>
									<Show when={shown().running}>
										<span class="inline-flex items-center gap-1 text-caption text-fg-subtle">
											<SpinnerIcon size="xs" /> Working
										</span>
									</Show>
								</>
							)}
						</Show>
					</div>
				</header>
				<main class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
					<For each={blocks()}>
						{(block) => (
							<Switch>
								<Match when={block.kind === "user" && block}>
									{(user) => <UserMessage meta={user().from}>{user().text}</UserMessage>}
								</Match>
								<Match when={block.kind === "agent" && block}>
									{(agent) => (
										<AgentMessage>
											<Prose html={renderMarkdown(agent().text)} />
										</AgentMessage>
									)}
								</Match>
								<Match when={block.kind === "step" && block}>
									{(step) => (
										<div class="flex min-w-0 items-center gap-2 text-caption text-fg-subtle">
											<Show when={step().done} fallback={<SpinnerIcon size="xs" />}>
												<CheckIcon size="xs" />
											</Show>
											<span class="min-w-0 truncate">{step().title}</span>
										</div>
									)}
								</Match>
								<Match when={block.kind === "asked" && block}>
									{(asked) => (
										<UserMessage
											meta={`${asked().name} · ${
												asked().state === "waiting"
													? "waiting for the thread's person"
													: asked().state === "sent"
														? "sent to the agent"
														: "not sent on"
											}`}
										>
											{asked().text}
										</UserMessage>
									)}
								</Match>
							</Switch>
						)}
					</For>
					<Show when={page() && blocks().length === 0}>
						<Text tone="subtle">Nothing has been said yet.</Text>
					</Show>
				</main>
				<footer class="sticky bottom-0 border-line border-t bg-surface px-4 pt-3 pb-safe">
					<Stack gap={2} class="mx-auto w-full max-w-3xl">
						<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
						<div class="flex flex-col gap-2 sm:flex-row">
							<Input
								aria-label="Your name"
								placeholder="Your name"
								maxlength={40}
								value={name()}
								onInput={(event) => setName(event.currentTarget.value)}
								class="sm:max-w-44"
							/>
							<Textarea
								aria-label="Ask something"
								rows={1}
								maxlength={4000}
								placeholder="Ask something; the thread's person sends it on"
								value={text()}
								onInput={(event) => setText(event.currentTarget.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.shiftKey) {
										event.preventDefault();
										void ask();
									}
								}}
								class="min-h-kit-control flex-1"
							/>
							<Button disabled={sending() || !text().trim()} onClick={() => void ask()}>
								Ask
							</Button>
						</div>
						<Show when={page()}>
							{(shown) => (
								<Text size="caption" tone="faint">
									Shared until{" "}
									{new Date(shown().expiresAt).toLocaleString(undefined, {
										weekday: "short",
										hour: "numeric",
										minute: "2-digit",
									})}
									.
								</Text>
							)}
						</Show>
					</Stack>
				</footer>
			</Show>
		</div>
	);
}
