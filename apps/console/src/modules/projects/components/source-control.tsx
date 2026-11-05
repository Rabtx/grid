import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
	Alert,
	ArrowUpIcon,
	Badge,
	BranchIcon,
	Button,
	Checkbox,
	ChevronDownIcon,
	ChevronRightIcon,
	DiffCard,
	DiffStat,
	EmptyState,
	EntryIcon,
	GitMark,
	IconButton,
	Input,
	notify,
	RestoreIcon,
	Skeleton,
	SparklesIcon,
	Spinner,
	Stack,
	Switch,
	Text,
	Textarea,
	TextLink,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { diffRows } from "@/modules/chat/lib/diff";

import { relativeTime } from "../lib/relative-time";
import { type SourceDiff, sourceService, type SourceStatus } from "../services/files.service";

type Busy = "load" | "init" | "commit" | "message" | "push" | "pull" | "github" | null;

function said(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/** "github.com/acme/web" from a remote's URL, however it is written. */
export function remoteLabel(url: string): string {
	return url
		.replace(/^[a-z+]+:\/\//, "")
		.replace(/^[^@/]+@/, "")
		.replace(/:(?!\d)/, "/")
		.replace(/\.git$/, "");
}

/**
 * A project's source control (Files → Source control): whether it is in git, and if not a way to
 * start; the branch and where it pushes; the changed files to choose from, each with its diff; a
 * commit message written by hand or by an agent; committing, and pushing what is not pushed yet.
 */
export function SourceControl(props: {
	slug: string;
	name: string;
	/** Where a file opens in the editor. */
	fileHref: (path: string) => string;
	/** Something was committed or started: the rest of the screen reads git again. */
	onChanged: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [status, setStatus] = createSignal<SourceStatus | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal<Busy>("load");
	const [message, setMessage] = createSignal("");
	/** Files left out of the commit; anything newly changed starts chosen. */
	const [left, setLeft] = createSignal<ReadonlySet<string>>(new Set());
	const [open, setOpen] = createSignal<ReadonlySet<string>>(new Set());
	const [diffs, setDiffs] = createSignal<ReadonlyMap<string, SourceDiff | string>>(new Map());

	const changes = () => status()?.changes ?? [];
	const chosen = createMemo(() => changes().filter((change) => !left().has(change.path)));
	const all = () => changes().length > 0 && chosen().length === changes().length;

	async function act<T>(kind: Exclude<Busy, null>, run: (token: string) => Promise<T>) {
		const token = auth.token();
		if (!token || busy()) return null;
		setBusy(kind);
		setError(null);
		try {
			return await run(token);
		} catch (cause) {
			setError(said(cause, "Something went wrong"));
			return null;
		} finally {
			setBusy(null);
		}
	}

	/** Read where the project stands; `fetch` asks the remote first (a second or two). */
	async function load(token: string, slug: string, fetch = false): Promise<void> {
		setBusy("load");
		try {
			const next = await sourceService.status(token, slug, fetch);
			if (slug !== props.slug) return;
			setStatus(next);
			setDiffs(new Map());
			setError(null);
		} catch (cause) {
			if (slug === props.slug) setError(said(cause, "Could not read this project's git"));
		} finally {
			if (slug === props.slug) setBusy(null);
		}
	}
	/** After the first read, ask the remote quietly: "to pull" fills in when it answers. */
	async function check(token: string, slug: string): Promise<void> {
		const next = await sourceService.status(token, slug, true).catch(() => null);
		if (next && slug === props.slug && busy() === null) setStatus(next);
	}
	const reload = () => {
		const token = auth.token();
		if (token) void load(token, props.slug, true);
	};
	const signer = () => {
		const user = auth.user();
		return user ? { name: user.username, email: user.email } : undefined;
	};
	createEffect(
		() => [auth.token() !== null, props.slug] as const,
		([signedIn, slug]) => {
			setStatus(null);
			setLeft(new Set<string>());
			setOpen(new Set<string>());
			setMessage("");
			const token = auth.token();
			if (signedIn && token) void load(token, slug).then(() => check(token, slug));
		},
	);

	function toggleDiff(path: string): void {
		const next = new Set(open());
		if (next.has(path)) {
			next.delete(path);
			setOpen(next);
			return;
		}
		next.add(path);
		setOpen(next);
		const token = auth.token();
		if (!token || diffs().has(path)) return;
		void sourceService.diff(token, props.slug, path).then(
			(diff) => setDiffs((current) => new Map(current).set(path, diff)),
			(cause: unknown) =>
				setDiffs((current) =>
					new Map(current).set(path, said(cause, "Could not show this change")),
				),
		);
	}

	function choose(path: string, on: boolean): void {
		const next = new Set(left());
		if (on) next.delete(path);
		else next.add(path);
		setLeft(next);
	}

	const start = () =>
		void act("init", async (token) => {
			setStatus(await sourceService.init(token, props.slug));
			notify({ title: `${props.name} is in git now` });
			props.onChanged();
		});

	const write = () =>
		void act("message", async (token) => {
			const written = await sourceService.message(
				token,
				props.slug,
				chosen().map((change) => change.path),
			);
			setMessage(written.message);
		});

	const commit = () =>
		void act("commit", async (token) => {
			const author = signer();
			const done = await sourceService.commit(token, props.slug, {
				paths: chosen().map((change) => change.path),
				message: message(),
				...(author ? { author } : {}),
			});
			setStatus(done.status);
			setMessage("");
			setLeft(new Set<string>());
			setOpen(new Set<string>());
			setDiffs(new Map());
			notify({ title: `Committed ${done.commit.sha}`, description: done.commit.subject });
			props.onChanged();
		});

	const push = () =>
		void act("push", async (token) => {
			setStatus(await sourceService.push(token, props.slug));
			notify({ title: "Pushed", description: status()?.upstream ?? undefined });
		});

	const pull = () =>
		void act("pull", async (token) => {
			const before = status()?.behind ?? 0;
			setStatus(await sourceService.pull(token, props.slug, signer()));
			setDiffs(new Map());
			notify({
				title: before > 0 ? `Pulled ${before} commit${before === 1 ? "" : "s"}` : "Up to date",
			});
			props.onChanged();
		});

	const [repoName, setRepoName] = createSignal("");
	const [repoPrivate, setRepoPrivate] = createSignal(true);
	const createRepo = () =>
		void act("github", async (token) => {
			const made = await sourceService.github(token, props.slug, {
				name: repoName().trim() || props.slug,
				private: repoPrivate(),
			});
			setStatus(made.status);
			notify({
				title: made.pushed ? "On GitHub and pushed" : "On GitHub",
				description: made.url,
			});
		});

	return (
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-gutter pt-4 pb-8 md:pt-10">
				<header class="flex items-start gap-3">
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<Text as="h1" size="headline" tone="strong" weight="medium" truncate>
							Source control
						</Text>
						<Show
							when={status()?.repo}
							fallback={
								<Text size="caption" tone="subtle">
									{props.name}
								</Text>
							}
						>
							<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
								<span class="flex items-center gap-1 text-fg">
									<BranchIcon size="xs" />
									{status()?.branch ?? "No branch"}
								</span>
								<Show
									when={status()?.remote}
									fallback={<span>No remote · commits stay on this machine</span>}
								>
									{(remote) => (
										<span class="truncate" title={remote().url}>
											{remoteLabel(remote().url)}
										</span>
									)}
								</Show>
								<Show when={(status()?.behind ?? 0) > 0}>
									<Badge tone="warning">{status()?.behind} to pull</Badge>
								</Show>
							</span>
						</Show>
					</div>
					<Show when={status()?.upstream}>
						<Button
							size="sm"
							variant="secondary"
							icon={busy() === "pull" ? <Spinner /> : <ArrowUpIcon class="rotate-180" />}
							disabled={busy() !== null}
							onClick={pull}
						>
							{busy() === "pull"
								? "Pulling…"
								: (status()?.behind ?? 0) > 0
									? `Pull ${status()?.behind}`
									: "Pull"}
						</Button>
					</Show>
					<IconButton label="Refresh" size="sm" onClick={reload} disabled={busy() !== null}>
						<RestoreIcon />
					</IconButton>
				</header>

				<Show when={error()}>{(text) => <Alert tone="danger" title={text()} />}</Show>

				<Show
					when={status()}
					fallback={
						<Stack gap={2}>
							<Skeleton class="h-24" />
							<Skeleton class="h-11" />
							<Skeleton class="h-11" />
						</Stack>
					}
				>
					{(current) => (
						<Show
							when={current().repo}
							fallback={
								<EmptyState
									icon={<BranchIcon size="lg" />}
									title="Not in git yet"
									description="Start a repository to see what changed, commit with a message an agent writes, and push to GitHub, all from here."
									action={
										<Button
											variant="primary"
											icon={busy() === "init" ? <Spinner /> : <BranchIcon />}
											disabled={busy() !== null}
											onClick={start}
										>
											{busy() === "init" ? "Starting…" : "Start git here"}
										</Button>
									}
								/>
							}
						>
							<Show when={!current().remote && current().top}>
								<section aria-label="Put it on GitHub" class="surface-card flex flex-col gap-3 p-4">
									<div class="flex flex-col gap-1">
										<Text weight="medium" tone="strong">
											Not on GitHub yet
										</Text>
										<Text size="caption" tone="subtle">
											Make a repository for {props.name} on your GitHub account and push what is
											committed. Uses your GitHub sign-in from{" "}
											<TextLink href={workspaceHref("/settings/connectors")} tone="accent">
												Settings → Connectors
											</TextLink>
											.
										</Text>
									</div>
									<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
										<Input
											aria-label="Repository name"
											placeholder={props.slug}
											value={repoName()}
											onInput={(event) => setRepoName(event.currentTarget.value)}
											class="min-w-0 flex-1"
										/>
										<span class="flex items-center gap-2 text-body text-fg">
											<Switch label="Private" checked={repoPrivate()} onChange={setRepoPrivate} />
											<span aria-hidden="true">Private</span>
										</span>
										<Button
											variant="primary"
											icon={busy() === "github" ? <Spinner /> : <ArrowUpIcon />}
											disabled={busy() !== null}
											onClick={createRepo}
										>
											{busy() === "github" ? "Creating…" : "Create on GitHub"}
										</Button>
									</div>
								</section>
							</Show>

							<Show when={current().ahead > 0 && current().remote}>
								<div class="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
									<Text tone="subtle" class="min-w-0 flex-1">
										{current().ahead} commit{current().ahead === 1 ? "" : "s"} not pushed yet
										{current().upstream ? ` to ${current().upstream}` : ""}.
									</Text>
									<Button
										variant="primary"
										icon={busy() === "push" ? <Spinner /> : <ArrowUpIcon />}
										disabled={busy() !== null}
										onClick={push}
									>
										{busy() === "push" ? "Pushing…" : "Push"}
									</Button>
								</div>
							</Show>

							<Show
								when={changes().length > 0}
								fallback={
									<EmptyState
										icon={<BranchIcon size="lg" />}
										tone="success"
										title="Nothing to commit"
										description="Every change in this project is committed."
									/>
								}
							>
								<section aria-label="Commit" class="surface-card flex flex-col gap-3 p-4">
									<Textarea
										aria-label="Commit message"
										placeholder="Say what changed, or let an agent write it"
										value={message()}
										onInput={(event) => setMessage(event.currentTarget.value)}
										rows={3}
										onKeyDown={(event) => {
											if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) commit();
										}}
									/>
									<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
										<Button
											variant="secondary"
											icon={busy() === "message" ? <Spinner /> : <SparklesIcon />}
											disabled={busy() !== null || chosen().length === 0}
											onClick={write}
										>
											{busy() === "message" ? "Writing…" : "Write message"}
										</Button>
										<span class="hidden flex-1 sm:block" />
										<Button
											variant="primary"
											icon={busy() === "commit" ? <Spinner /> : undefined}
											disabled={busy() !== null || chosen().length === 0 || message().trim() === ""}
											onClick={commit}
										>
											{busy() === "commit"
												? "Committing…"
												: `Commit ${chosen().length} file${chosen().length === 1 ? "" : "s"}`}
										</Button>
									</div>
									<Show when={!current().identity.email && auth.user()}>
										{(user) => (
											<Text size="caption" tone="subtle">
												Signed as {user().username} &lt;{user().email}&gt;: git has no name set on
												this machine.
											</Text>
										)}
									</Show>
								</section>

								<section aria-label="Changes" class="flex flex-col">
									<div class="flex items-center gap-3 px-1 pb-1">
										<Checkbox
											label="Choose every file"
											checked={all()}
											indeterminate={!all() && chosen().length > 0}
											onChange={(on) =>
												setLeft(
													on ? new Set<string>() : new Set(changes().map((change) => change.path)),
												)
											}
										/>
										<Text size="caption" tone="subtle" class="flex-1">
											{changes().length} changed · {chosen().length} chosen
										</Text>
									</div>
									<For each={changes()}>
										{(change) => (
											<div class="flex flex-col border-line border-b last:border-b-0">
												<div class="flex min-h-11 items-center gap-3 px-1">
													<Checkbox
														label={`Commit ${change.path}`}
														checked={!left().has(change.path)}
														onChange={(on) => choose(change.path, on)}
													/>
													<button
														type="button"
														class="focus-ring flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
														aria-expanded={open().has(change.path) ? "true" : "false"}
														onClick={() => toggleDiff(change.path)}
													>
														<Show
															when={open().has(change.path)}
															fallback={
																<ChevronRightIcon size="xs" class="shrink-0 text-fg-faint" />
															}
														>
															<ChevronDownIcon size="xs" class="shrink-0 text-fg-faint" />
														</Show>
														<EntryIcon name={change.path} folder={false} />
														<span class="min-w-0 truncate text-body text-fg" title={change.path}>
															{change.from ? `${change.from} → ` : ""}
															{change.path}
														</span>
														<Show when={change.added !== null}>
															<DiffStat added={change.added ?? 0} removed={change.removed ?? 0} />
														</Show>
													</button>
													<GitMark status={change.status} />
												</div>
												<Show when={open().has(change.path)}>
													<div class="pb-3">
														<ChangeDiff
															path={change.path}
															diff={diffs().get(change.path)}
															href={
																change.status === "deleted" ? null : props.fileHref(change.path)
															}
														/>
													</div>
												</Show>
											</div>
										)}
									</For>
								</section>
							</Show>

							<Show when={current().recent.length > 0}>
								<section aria-label="Recent commits" class="flex flex-col gap-1">
									<Text size="caption" tone="subtle" class="px-1">
										Recent commits
									</Text>
									<For each={current().recent}>
										{(commit) => (
											<div class="flex min-h-10 items-center gap-3 px-1 text-body">
												<span class="shrink-0 font-mono text-caption text-fg-faint">
													{commit.sha}
												</span>
												<span class="min-w-0 flex-1 truncate text-fg" title={commit.subject}>
													{commit.subject}
												</span>
												<span class="hidden shrink-0 text-caption text-fg-subtle sm:inline">
													{commit.author} · {relativeTime(commit.at)}
												</span>
											</div>
										)}
									</For>
								</section>
							</Show>
						</Show>
					)}
				</Show>
			</div>
		</div>
	);
}

/** One file's diff, once read: the lines, or why there are none, with a way to open the file. */
function ChangeDiff(props: {
	path: string;
	diff: SourceDiff | string | undefined;
	href: string | null;
}): JSX.Element {
	const shown = () => (typeof props.diff === "object" ? props.diff : null);
	const lines = createMemo(() => {
		const diff = shown()?.diff;
		return diff ? diffRows({ path: props.path, patch: diff, added: 0, removed: 0 }) : [];
	});
	return (
		<Show when={props.diff !== undefined} fallback={<Skeleton class="h-24" />}>
			<Show
				when={lines().length > 0}
				fallback={
					<div class="flex items-center gap-3 px-1">
						<Text size="caption" tone="subtle" class="flex-1">
							{typeof props.diff === "string"
								? props.diff
								: shown()?.binary
									? "A binary file: there are no lines to show."
									: shown()?.tooLarge
										? "Too large to show here."
										: "No lines changed."}
						</Text>
						<Show when={props.href}>
							{(href) => (
								<a href={href()} class="focus-ring text-caption text-accent">
									Open file
								</a>
							)}
						</Show>
					</div>
				}
			>
				<DiffCard path={props.path} lines={lines()} />
			</Show>
		</Show>
	);
}
