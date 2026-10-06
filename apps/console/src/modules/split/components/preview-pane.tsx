import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { terminalsService } from "@/modules/terminal/services/terminals.service";
import {
	Button,
	button,
	EmptyState,
	ExternalIcon,
	GlobeIcon,
	IconButton,
	iconButton,
	LivePreview,
	RestoreIcon,
	Segmented,
	Text,
} from "@/kit";

import { previewUrl } from "../lib/preview";
import { type ThreadPlace, threadTerminals } from "../stores/thread-terminals";

/** How often the pane asks what the thread's shell is serving, while it shows. */
const PORTS_EVERY_MS = 4000;

/**
 * What the thread's terminal serves (a dev server it started), shown in place. The ports come
 * from the runner, which watches the shell; nothing is guessed. A page that refuses to be framed,
 * or a plain-http server under an https Grid, is opened in its own tab instead.
 */
export function PreviewPane(props: {
	place: ThreadPlace;
	active: boolean;
	/** Open the terminal tab: where a dev server is started. */
	onShowTerminal: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [ports, setPorts] = createSignal<number[]>([]);
	const [chosen, setChosen] = createSignal<number | null>(null);
	const [reload, setReload] = createSignal(0);
	const port = createMemo(() => {
		const list = ports();
		const wanted = chosen();
		return wanted !== null && list.includes(wanted) ? wanted : (list[0] ?? null);
	});
	const target = createMemo(() => {
		const current = port();
		return current === null ? null : previewUrl(window.location, current);
	});

	async function look(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			// The thread's own shell: the same one the terminal tab shows, opened if it is not yet.
			const terminal = await threadTerminals.ensure(token, props.place);
			const list = await terminalsService.list(token, props.place.environment, true);
			const mine = list.find((item) => item.id === terminal.id);
			setPorts([...(mine?.status?.ports ?? [])].sort((a, b) => a - b));
		} catch {
			// The runner is unreachable for now: keep showing what was there and look again soon.
		}
	}

	createEffect(
		() => props.active,
		(active) => {
			if (!active) return;
			void look();
			const timer = setInterval(() => void look(), PORTS_EVERY_MS);
			onCleanup(() => clearInterval(timer));
		},
	);

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<Show
				when={target()}
				fallback={
					<div class="grid flex-1 place-items-center">
						<EmptyState
							icon={<GlobeIcon />}
							title="Nothing to preview yet"
							description="Start a dev server in this thread's terminal and it shows here."
							action={
								<Button size="sm" onClick={() => props.onShowTerminal()}>
									Open the terminal
								</Button>
							}
						/>
					</div>
				}
			>
				{(page) => (
					<>
						<div class="flex h-kit-control shrink-0 items-center gap-2 border-line border-b px-2">
							<Show when={ports().length > 1}>
								<Segmented
									label="Port"
									size="sm"
									options={ports().map((value) => ({ value: String(value), label: `:${value}` }))}
									value={String(port())}
									onChange={(value) => setChosen(Number(value))}
								/>
							</Show>
							<Text size="caption" tone="subtle" truncate class="min-w-0 flex-1 font-mono">
								{page().href}
							</Text>
							<IconButton label="Reload" size="xs" onClick={() => setReload((count) => count + 1)}>
								<RestoreIcon size="sm" />
							</IconButton>
							<a
								href={page().href}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Open in a new tab"
								data-tooltip="Open in a new tab"
								class={iconButton({ size: "xs" })}
							>
								<ExternalIcon size="sm" />
							</a>
						</div>
						<Show
							when={page().frameable}
							fallback={
								<div class="grid flex-1 place-items-center">
									<EmptyState
										icon={<ExternalIcon />}
										title="Opens in its own tab"
										description="Grid is on https and this server is plain http, so the browser will not show it inside the page."
										action={
											<a
												href={page().href}
												target="_blank"
												rel="noopener noreferrer"
												class={button({ size: "sm" })}
											>
												Open {page().host}
											</a>
										}
									/>
								</div>
							}
						>
							<For each={[reload()]}>
								{() => <LivePreview title={`Preview of ${page().host}`} src={page().href} />}
							</For>
						</Show>
					</>
				)}
			</Show>
		</div>
	);
}
