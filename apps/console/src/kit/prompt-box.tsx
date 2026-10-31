import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";

import { ICON_SIZE } from "./button";
import { attachEdgeFade } from "./edge-fade";
import { CheckIcon, CloseIcon, SpinnerIcon } from "./icons";
import { PopoverAnchor } from "./popover";

/**
 * Where you write to an agent: one raised, lit card with the text on top and a toolbar under it —
 * tools on the left, the model, the mic and send on the right. A second card tucks behind it with
 * the context that would crowd the toolbar (the branch, the role, the queue). It glows in the
 * accent while you type. Chat owns the text and sending; this is its shape.
 */
export function PromptBox(props: {
	field: JSX.Element;
	attachments?: JSX.Element;
	onDragOver?: (event: DragEvent) => void;
	onDrop?: (event: DragEvent) => void;
	/** Left of the toolbar: attach, mode, project. */
	tools?: JSX.Element;
	/** Right of the toolbar, before send: the model, the mic. */
	options?: JSX.Element;
	send: JSX.Element;
	/** In the toolbar after the tools: where the agent works, the branch. */
	tray?: JSX.Element;
	/**
	 * Behind the card and peeking out below it: the composer's shelf for what does not belong in
	 * the toolbar — the branch, the role, the queue.
	 */
	dock?: JSX.Element;
	/** Floats inside the card over the text: the @-mention list. */
	overlay?: JSX.Element;
	/** The card is a form: Enter-to-send and the send button submit it. */
	onSubmit?: (event: SubmitEvent) => void;
	/** The form element, for voice dictation to find its field. */
	formRef?: (form: HTMLFormElement) => void;
	/**
	 * While dictating: the recording bar, in place of the field and toolbar. They stay in the
	 * page, hidden, so the words land in the field when it ends.
	 */
	voice?: JSX.Element;
	class?: string;
}): JSX.Element {
	let tools: HTMLDivElement | undefined;
	let card: HTMLFormElement | undefined;
	onSettled(() => (tools ? attachEdgeFade(tools) : undefined));
	// Each read of a JSX prop builds it anew: read these once.
	const voice = createMemo(() => props.voice);
	const attachments = createMemo(() => props.attachments);
	const dock = createMemo(() => props.dock);
	return (
		<PopoverAnchor value={() => card}>
			<div class={`relative flex flex-col ${props.class ?? ""}`}>
				{/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- file drop supplements the keyboard-accessible picker */}
				<form
					ref={(el) => {
						card = el;
						props.formRef?.(el);
					}}
					onDragOver={(event) => props.onDragOver?.(event)}
					onDrop={(event) => props.onDrop?.(event)}
					onSubmit={(event) => {
						event.preventDefault();
						props.onSubmit?.(event);
					}}
					class="surface-card relative z-10 flex flex-col rounded-kit-2xl transition-shadow duration-base ease-out-grid focus-within:shadow-focus"
				>
					<Show when={voice()}>{voice()}</Show>
					<div class={voice() ? "hidden" : "contents"}>
						{props.overlay}
						{/* What goes with the message sits above its text, as the Figma composer draws it. */}
						<Show when={attachments()}>
							<div class="flex flex-wrap gap-2 px-3 pt-3">{attachments()}</div>
						</Show>
						{props.field}
						<div class="flex items-center gap-1.5 px-3 pb-3">
							<div
								ref={(el) => {
									tools = el;
								}}
								class="edge-fade flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]"
							>
								{props.tools}
								<Show when={props.tray}>
									<span class="flex min-w-0 shrink-0 items-center gap-1.5 text-body text-fg-muted">
										{props.tray}
									</span>
								</Show>
							</div>
							{props.options}
							{props.send}
						</div>
					</div>
				</form>
				<Show when={dock()}>
					<div class="relative z-0 -mt-4 mx-3 flex flex-col gap-2 rounded-b-kit-xl bg-surface-sunken px-2 pt-7 pb-2 ring-line md:mx-5 md:px-2.5">
						{dock()}
					</div>
				</Show>
			</div>
		</PopoverAnchor>
	);
}

/**
 * The composer's text field: no chrome of its own. Its `rows` set the height it starts at; the
 * composer grows it with the text to five lines, then it scrolls (the cap here is a backstop).
 */
export const PROMPT_FIELD =
	"block max-h-40 w-full resize-none overflow-y-hidden bg-transparent px-4 pt-3.5 pb-2 text-fg text-field outline-none [scrollbar-width:thin] placeholder:text-fg-subtle";

/** A tool chip on the composer's toolbar: plus, a mode, a project. */
export const PROMPT_CHIP =
	"focus-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-kit bg-fill-strong px-2 text-body text-fg transition-colors duration-fast hover:bg-selection aria-expanded:bg-selection pointer-coarse:h-9";

/**
 * A quiet chip on the composer's shelf (the role, crew, the mode): text until hovered or open, so
 * the shelf stays calmer than the toolbar above it.
 */
export const DOCK_CHIP =
	"focus-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-kit px-2 text-body text-fg-muted transition-colors duration-fast hover:bg-fill-strong hover:text-fg aria-expanded:bg-fill-strong aria-expanded:text-fg pointer-coarse:h-9";

/** The filled square at the start of the toolbar: add files, context, tools. */
export const PROMPT_ADD = `focus-ring grid size-7 shrink-0 place-items-center rounded-kit icon-tile text-fg-muted transition-colors duration-fast hover:text-fg pointer-coarse:size-10 ${ICON_SIZE.md}`;

/**
 * On touch screens send and stop are drawn 32px, the size of the tiles beside them (the mic, the
 * add), and an invisible margin keeps their tap area 40px.
 */
const TOUCH_32 = "pointer-coarse:size-8 after:absolute after:-inset-1";

/**
 * The send button: the same shape as the tiles beside it, quiet until there is something to send,
 * then it fills with ink.
 */
export const SEND_BUTTON = `focus-ring relative grid size-7 shrink-0 place-items-center rounded-pill bg-inverse text-inverse-fg surface-primary transition-[background-color,color,box-shadow,scale] duration-base ease-out-grid active:scale-95 disabled:bg-fill-strong disabled:bg-none disabled:text-fg-faint disabled:shadow-none ${TOUCH_32} ${ICON_SIZE.md}`;

/** Stop, in place of send while the agent works: a ring turns inside it until it is done. */
/** Beside stop while the agent works: send the message into the turn going on. */
export const STEER_BUTTON = `focus-ring relative inline-flex h-7 shrink-0 items-center rounded-pill px-2.5 font-medium text-caption text-fg ring-line-strong transition-colors duration-fast hover:bg-fill disabled:text-fg-faint pointer-coarse:h-10`;

export const STOP_BUTTON = `focus-ring relative grid size-7 shrink-0 place-items-center rounded-pill bg-fill-strong text-fg transition-transform duration-fast active:scale-95 ${TOUCH_32} ${ICON_SIZE.md}`;

/** The ring turning inside the stop button while the agent works. */
export function WorkingRing(): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class="pointer-events-none absolute inset-1 animate-spin rounded-full border-2 border-transparent border-t-accent [animation-duration:1.1s] motion-reduce:animate-none"
		/>
	);
}

/** The composer's mic: red while it listens. */
export const MIC_BUTTON = `focus-ring grid size-7 shrink-0 place-items-center rounded-pill text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg aria-pressed:bg-danger aria-pressed:text-white pointer-coarse:size-10 ${ICON_SIZE.md}`;

/** A round-cornered square icon button on the composer's toolbar: the mic, a tool. */
export const PROMPT_ICON = `focus-ring grid size-7 shrink-0 place-items-center rounded-kit icon-tile text-fg-muted transition-colors duration-fast hover:text-fg pointer-coarse:size-10 ${ICON_SIZE.md}`;

/**
 * Ways into a first message: chips that scroll sideways on phones (in thumb reach, above the
 * composer) and a quiet list on desktop (under it).
 */
export function Suggestions(props: {
	items: readonly { icon: JSX.Element; label: string }[];
	onPick: (label: string) => void;
	/** Layout only. */
	class?: string;
}): JSX.Element {
	let list: HTMLUListElement | undefined;
	onSettled(() => (list ? attachEdgeFade(list) : undefined));
	return (
		<ul
			ref={(el) => {
				list = el;
			}}
			class={`edge-fade flex gap-2 overflow-x-auto [scrollbar-width:none] md:flex-wrap md:overflow-visible ${props.class ?? ""}`}
		>
			<For each={props.items}>
				{(item) => (
					<li class="shrink-0">
						<button
							type="button"
							onClick={() => props.onPick(item.label)}
							class="surface-outline focus-ring flex h-8 items-center gap-2 whitespace-nowrap rounded-pill px-3 text-body text-fg transition-colors duration-fast hover:bg-fill pointer-coarse:h-9"
						>
							<span class="text-fg-muted [&_svg]:size-3.5">{item.icon}</span>
							{item.label}
						</button>
					</li>
				)}
			</For>
		</ul>
	);
}

/** Minutes and seconds since a moment: 0:07. */
function clock(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Dictating into the composer (Figma 10 · Composer, Voice): cancel on the left, a red dot and the
 * time, the microphone's level as a waveform (or the words heard so far, where the recogniser
 * streams them), and a round check that ends it and puts the words in. While the recording turns
 * into text, the check waits.
 */
export function VoiceBar(props: {
	/** When listening began. */
	startedAt: number;
	/** Loudness readings, 0 to 1, oldest first; empty when the engine has none. */
	levels: readonly number[];
	/** Words heard so far, where the engine streams them. */
	heard?: string | null;
	transcribing: boolean;
	onCancel: () => void;
	onDone: () => void;
}): JSX.Element {
	const [now, setNow] = createSignal(Date.now());
	let done: HTMLButtonElement | undefined;
	onSettled(() => {
		// The field it replaces had the focus; keep the keyboard in the bar.
		done?.focus({ preventScroll: true });
		const timer = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(timer);
	});
	return (
		<div class="flex h-14 items-center gap-3 px-3 pointer-coarse:h-16">
			<button
				type="button"
				aria-label="Cancel voice input"
				onClick={() => props.onCancel()}
				class="focus-ring grid size-8 shrink-0 place-items-center rounded-pill text-fg-subtle transition-colors duration-fast hover:bg-fill hover:text-fg pointer-coarse:size-10"
			>
				<CloseIcon size="sm" />
			</button>
			<span class="flex shrink-0 items-center gap-2 text-body text-fg tabular-nums">
				<span
					aria-hidden="true"
					class={`size-2 rounded-full bg-danger ${props.transcribing ? "" : "motion-safe:animate-pulse"}`}
				/>
				{clock(now() - props.startedAt)}
			</span>
			<output
				aria-live="polite"
				class="flex h-8 min-w-0 flex-1 items-center justify-end overflow-hidden"
			>
				<Show
					when={!props.transcribing}
					fallback={
						<span class="flex items-center gap-2 text-body text-fg-subtle">
							<SpinnerIcon size="sm" class="animate-spin" />
							Transcribing…
						</span>
					}
				>
					<Show
						when={props.levels.length > 0}
						fallback={
							<span class="truncate text-body text-fg-muted">{props.heard || "Listening…"}</span>
						}
					>
						<span aria-hidden="true" class="flex h-full items-center gap-0.5">
							<For each={props.levels}>
								{(level) => (
									<span
										class="w-0.5 shrink-0 rounded-full bg-fg"
										style={{ height: `${Math.max(8, Math.round(level * 100))}%` }}
									/>
								)}
							</For>
						</span>
						<span class="sr-only">Listening</span>
					</Show>
				</Show>
			</output>
			<button
				ref={(el) => {
					done = el;
				}}
				type="button"
				aria-label="Done, insert the words"
				disabled={props.transcribing}
				onClick={() => props.onDone()}
				class={`focus-ring grid size-9 shrink-0 place-items-center rounded-pill bg-inverse text-inverse-fg surface-primary transition-transform duration-fast active:scale-95 disabled:opacity-60 ${ICON_SIZE.md}`}
			>
				<CheckIcon />
			</button>
		</div>
	);
}
