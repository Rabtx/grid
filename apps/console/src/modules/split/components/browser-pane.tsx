import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onCleanup, onSettled, Show, untrack } from "solid-js";

import {
	BackIcon,
	BrowserIcon,
	Button,
	CloseIcon,
	EmptyState,
	IconButton,
	Input,
	notify,
	RemotePage,
	RestoreIcon,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { chatService } from "@/modules/chat/services/chat.service";
import type { BrowserState } from "@/modules/chat/types/chat.types";

import type { ThreadPlace } from "../stores/thread-terminals";

// How often the pane looks at the page while it shows: often enough to follow an agent at work.
const FRAME_EVERY_MS = 1_500;
// Typed characters are sent together once the typing pauses this long.
const TYPE_BATCH_MS = 150;

/**
 * The thread's browser: the page its agent opens with Grid's browser tools, live, on the machine
 * the thread runs on. The person sees what the agent sees and can use it too: an address to
 * open, back, reload, and clicks, typing and scrolling on the page itself.
 */
export function BrowserPane(props: { place: ThreadPlace; active: boolean }): JSX.Element {
	const auth = useAuth();
	const [state, setState] = createSignal<BrowserState | null>(null);
	const [frame, setFrame] = createSignal<string | null>(null);
	const [address, setAddress] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	let typed = "";
	let typeTimer: ReturnType<typeof setTimeout> | undefined;

	const scope = () => props.place.environment ?? "";
	const showFrame = (blob: Blob | null) => {
		const previous = untrack(frame);
		setFrame(blob ? URL.createObjectURL(blob) : null);
		if (previous) URL.revokeObjectURL(previous);
	};

	async function look(force = false): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			const next = await chatService.browser(token, props.place.thread, scope());
			setState(next);
			if (!untrack(address) || force) setAddress(next.url === "about:blank" ? "" : next.url);
			if (!next.open) return showFrame(null);
			// Every look takes a fresh picture: a page changes by itself (a spinner, a live feed).
			showFrame(await chatService.browserFrame(token, props.place.thread, scope()));
		} catch {
			// The runner is unreachable for now: keep what is shown and look again soon.
		}
	}

	async function act(
		action: Parameters<typeof chatService.browserAct>[2],
		body: Record<string, unknown> = {},
	): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setBusy(true);
		try {
			const next = await chatService.browserAct(token, props.place.thread, action, body, scope());
			if (next) setState(next);
			if (action === "open" || action === "back") setAddress(next?.url ?? untrack(address));
			await look(action === "open" || action === "back" || action === "reload");
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "The browser did not do that",
				tone: "danger",
			});
		} finally {
			setBusy(false);
		}
	}

	const typeSoon = (text: string) => {
		typed += text;
		clearTimeout(typeTimer);
		typeTimer = setTimeout(() => {
			const batch = typed;
			typed = "";
			if (batch) void act("type", { text: batch });
		}, TYPE_BATCH_MS);
	};

	createEffect(
		() => props.active,
		(active) => {
			if (!active) return;
			void look();
			const timer = setInterval(() => void look(), FRAME_EVERY_MS);
			onCleanup(() => clearInterval(timer));
		},
	);
	onSettled(() => () => {
		clearTimeout(typeTimer);
		const shown = untrack(frame);
		if (shown) URL.revokeObjectURL(shown);
	});

	const open = () => {
		const url = address().trim();
		if (url) void act("open", { url });
	};

	const bar = (
		<form
			class="flex h-kit-control shrink-0 items-center gap-1.5 border-line border-b px-2"
			onSubmit={(event) => {
				event.preventDefault();
				open();
			}}
		>
			<IconButton
				label="Back"
				size="xs"
				disabled={!state()?.open || busy()}
				onClick={() => void act("back")}
			>
				<BackIcon size="sm" />
			</IconButton>
			<IconButton
				label="Reload"
				size="xs"
				disabled={!state()?.open || busy()}
				onClick={() => void act("reload")}
			>
				<RestoreIcon size="sm" />
			</IconButton>
			<Input
				aria-label="Address"
				placeholder="Open an address, e.g. localhost:3000"
				value={address()}
				onInput={(event) => setAddress(event.currentTarget.value)}
				class="h-kit-control-sm min-w-0 flex-1 font-mono text-caption"
			/>
			<Show when={state()?.open}>
				<IconButton label="Close the page" size="xs" onClick={() => void act("close")}>
					<CloseIcon size="sm" />
				</IconButton>
			</Show>
		</form>
	);

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<Show
				when={state()?.available !== false}
				fallback={
					<div class="grid flex-1 place-items-center">
						<EmptyState
							icon={<BrowserIcon />}
							title="No browser on this machine"
							description="Install Chrome or Chromium where this thread runs (or set GRID_BROWSER to one) and agents can open pages here."
						/>
					</div>
				}
			>
				{bar}
				<Show
					when={state()?.open}
					fallback={
						<div class="grid flex-1 place-items-center">
							<EmptyState
								icon={<BrowserIcon />}
								title="No page open"
								description="Agents open pages here with Grid's browser, and you can too: type an address above. You both see and use the same page."
								action={
									<Button size="sm" disabled={!address().trim() || busy()} onClick={open}>
										Open
									</Button>
								}
							/>
						</div>
					}
				>
					<RemotePage
						title={state()?.title || "The thread's browser page"}
						src={frame()}
						busy={busy()}
						onClickAt={(x, y) => void act("click", { x, y })}
						onType={typeSoon}
						onKey={(key) => void act("key", { key })}
						onScroll={(by) => void act("scroll", { by })}
					/>
				</Show>
			</Show>
		</div>
	);
}
