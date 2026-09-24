import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
	CloseIcon,
	ErrorNotice,
	FolderIcon,
	IconButton,
	PlusIcon,
	SearchIcon,
	Skeleton,
} from "@/ui";

import type { ChatProvider, ChatSession } from "../types/chat.types";

function relative(iso: string): string {
	const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

/** The agent's initial in a small tile, so chats from different agents read apart. */
export function ProviderMark(props: { provider: string; class?: string }): JSX.Element {
	return (
		<span
			class={`grid shrink-0 place-items-center rounded-[0.25rem] bg-ink/15 font-semibold text-ink/80 text-ui-caption uppercase leading-none ${props.class ?? "size-3.5"}`}
			aria-hidden="true"
		>
			{props.provider.slice(0, 1)}
		</span>
	);
}

/** "Claude Opus 4.6" when the model is known, else the agent's name. */
export function sessionModel(session: ChatSession, providers: ChatProvider[]): string {
	const provider = providers.find((item) => item.id === session.provider);
	const model = provider?.models.find((item) => item.id === session.model);
	if (model) return model.name;
	if (session.model && session.model !== "default") return session.model;
	return provider?.name ?? session.provider;
}

const shortPath = (path: string) => path.replace(/^\/home\/[^/]+/, "~");

/**
 * The project's chats as the workspace panel: a header with the project and a new-chat button,
 * a filter, and one card per chat (agent and model, age, title, where it works).
 */
export function SessionList(props: {
	projectName: string;
	sessions: ChatSession[];
	providers: ChatProvider[];
	loaded: boolean;
	error: string | null;
	activeId: string | null;
	hrefFor: (id: string) => string;
	onNew: () => void;
}): JSX.Element {
	const [filter, setFilter] = createSignal("");
	let input: HTMLInputElement | undefined;

	const shown = createMemo(() => {
		const words = filter().toLowerCase().split(/\s+/).filter(Boolean);
		if (words.length === 0) return props.sessions;
		return props.sessions.filter((session) => {
			const text =
				`${session.title} ${sessionModel(session, props.providers)} ${session.cwd}`.toLowerCase();
			return words.every((word) => text.includes(word));
		});
	});

	return (
		<section aria-label="Chats" class="flex min-h-0 flex-1 flex-col">
			<header class="flex h-10 shrink-0 select-none items-center gap-1 border-stroke border-b pr-1.5 pl-3 pointer-coarse:h-12">
				<h2 class="min-w-0 flex-1 truncate font-medium text-ui">{props.projectName}</h2>
				<IconButton size="sm" label="Search chats" onClick={() => input?.focus()}>
					<SearchIcon class="size-3.5" />
				</IconButton>
				<IconButton size="sm" label="New chat" onClick={() => props.onNew()}>
					<PlusIcon class="size-3.5" />
				</IconButton>
			</header>
			<div class="flex h-9 shrink-0 items-center gap-1 border-stroke border-b px-2 pointer-coarse:h-11">
				<div class="relative flex h-7 min-w-0 flex-1 items-center">
					<SearchIcon class="pointer-events-none absolute left-2 size-3 text-ink/40" />
					<input
						ref={(el) => {
							input = el;
						}}
						value={filter()}
						onInput={(event) => setFilter(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") setFilter("");
						}}
						aria-label="Filter chats"
						placeholder="Search chats…"
						autocomplete="off"
						spellcheck={false}
						class="h-full w-full min-w-0 rounded-md bg-transparent pr-2 pl-7 text-ink text-ui-xs outline-none placeholder:text-ink/35 pointer-coarse:text-ui-input"
					/>
				</div>
				<Show when={filter()}>
					<IconButton size="sm" label="Clear filter" onClick={() => setFilter("")}>
						<CloseIcon class="size-3" />
					</IconButton>
				</Show>
			</div>
			<Show when={props.error}>
				{(message) => (
					<div class="px-2 pt-2">
						<ErrorNotice message={message()} />
					</div>
				)}
			</Show>
			<nav
				aria-label="Chats in this project"
				class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
			>
				<Show
					when={props.loaded}
					fallback={
						<div class="flex flex-col gap-1.5 p-1.5" aria-hidden="true">
							<Skeleton class="h-18" />
							<Skeleton class="h-18" />
						</div>
					}
				>
					<Show
						when={shown().length > 0}
						fallback={
							<p class="px-4 py-8 text-center text-ink/45 text-ui-xs">
								{filter() ? "No chats match." : "No chats in this project yet."}
							</p>
						}
					>
						<ul class="flex flex-col gap-0.5 p-1.5">
							<For each={shown()}>
								{(session) => (
									<li>
										<a
											href={props.hrefFor(session.id)}
											aria-current={props.activeId === session.id ? "page" : undefined}
											class="focus-ring flex flex-col gap-1 rounded-md border border-transparent px-2.5 py-2 text-ink/80 transition-colors duration-fast ease-out-grid hover:bg-ink/5 hover:text-ink aria-[current=page]:bg-selection aria-[current=page]:text-ink"
										>
											<span class="flex items-center gap-2">
												<span class="flex min-w-0 flex-1 items-center gap-1.5">
													<ProviderMark provider={session.provider} />
													<span class="min-w-0 truncate text-ink/50 text-ui-caption">
														{sessionModel(session, props.providers)}
													</span>
												</span>
												<span class="shrink-0 text-ink/45 text-ui-caption tabular-nums">
													{relative(session.updatedAt)}
												</span>
											</span>
											<span class="line-clamp-1 font-semibold text-ink text-ui-sm leading-snug">
												{session.title}
											</span>
											<span class="flex min-w-0 items-center gap-1 text-ink/45 text-ui-caption">
												<FolderIcon class="size-3 shrink-0" />
												<span class="min-w-0 truncate">{shortPath(session.cwd)}</span>
											</span>
										</a>
									</li>
								)}
							</For>
						</ul>
					</Show>
				</Show>
			</nav>
		</section>
	);
}

/**
 * The chats open in the title bar, like browser tabs: the current one filled, each closable,
 * and "New chat" while the composer is showing. Phones show only the current one.
 */
export function SessionTabs(props: {
	tabs: ChatSession[];
	activeId: string | null;
	compact: boolean;
	hrefFor: (id: string) => string;
	onClose: (id: string) => void;
}): JSX.Element {
	const visible = () =>
		props.compact ? props.tabs.filter((tab) => tab.id === props.activeId) : props.tabs;

	return (
		<div role="tablist" aria-label="Open chats" class="flex min-w-0 items-center gap-0.5">
			<For each={visible()}>
				{(tab) => (
					<div
						class="group flex h-7 min-w-20 max-w-56 shrink items-center gap-1 rounded-md pr-0.5 pl-2 text-ink/55 hover:bg-ink/6 hover:text-ink aria-selected:bg-selection aria-selected:text-ink pointer-coarse:h-9"
						aria-selected={props.activeId === tab.id ? "true" : "false"}
					>
						<a
							role="tab"
							href={props.hrefFor(tab.id)}
							aria-selected={props.activeId === tab.id ? "true" : "false"}
							class="focus-ring flex min-w-0 items-center gap-1.5 rounded-sm text-ui-sm"
						>
							<ProviderMark provider={tab.provider} />
							<span class="truncate">{tab.title}</span>
						</a>
						<Show when={!props.compact}>
							<button
								type="button"
								aria-label={`Close ${tab.title}`}
								title="Close tab"
								onClick={() => props.onClose(tab.id)}
								class="focus-ring grid size-5 shrink-0 place-items-center rounded-sm text-ink/40 opacity-0 hover:bg-ink/10 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 group-aria-selected:opacity-100"
							>
								<CloseIcon class="size-3" />
							</button>
						</Show>
					</div>
				)}
			</For>
			<Show when={!props.activeId}>
				<div
					role="tab"
					aria-selected="true"
					class="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-selection px-2 text-ink text-ui-sm pointer-coarse:h-9"
				>
					<PlusIcon class="size-3.5 text-ink/55" />
					New chat
				</div>
			</Show>
		</div>
	);
}
