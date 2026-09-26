import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";
import { insertIntoField, MicButton, registerDictationTarget } from "@/modules/voice";
import { BranchIcon, SendIcon, StopSquareIcon } from "@/ui";

import { useFileMentions } from "../lib/use-file-mentions";
import { FileMentionPopup } from "./file-mention-popup";

/** An item in the strip under the composer — 44px for a thumb. */
const CONTEXT_CHIP =
	"flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-sm text-ink/55 transition-colors duration-fast ease-out-grid pointer-coarse:h-8";

/** The composer's two round buttons beside the toolbar: the mic and send (or stop). */
const ROUND =
	"focus-ring grid size-8 shrink-0 place-items-center rounded-full transition-[background-color,color,opacity,transform] duration-fast ease-out-grid active:scale-95 pointer-coarse:size-11";

/** Put text in the composer from outside it: a suggestion picked on the new-chat screen. */
export type ComposerControl = { fill: (text: string) => void };

/** What the field asks for until the caller says otherwise. */
const PLACEHOLDER = "Ask, build, / for commands, @ for references…";

/**
 * Where a message is written. Enter sends on a physical keyboard (Shift+Enter for a new line);
 * on a phone Enter is a new line and the send button sends. While the agent works, the button
 * stops it. A text field, so voice input lands here with no extra wiring.
 */
export function Composer(props: {
	placeholder?: string;
	running: boolean;
	disabled?: boolean;
	/** Send the text; return false to keep the draft (e.g. the link is down). */
	onSend: (text: string) => boolean | Promise<boolean>;
	onStop?: () => void;
	/** The toolbar's pickers: model and mode. */
	controls?: JSX.Element;
	/** The context row: e.g. the folder the agent works in. */
	header?: JSX.Element;
	/** The branch that folder is on, when it is known. */
	branch?: string;
	/** Text to start with, e.g. a task a thread is started from. */
	initial?: string;
	/** The project slug, for file mentions autocomplete. */
	project?: string | null;
	/** Hands over a way to fill the field from outside. */
	control?: (control: ComposerControl) => void;
}): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const [draft, setDraft] = createSignal(untrack(() => props.initial) ?? "");
	const [sending, setSending] = createSignal(false);
	let textarea: HTMLTextAreaElement | undefined;
	let form: HTMLFormElement | undefined;

	const projectSlug = () => props.project ?? workspace.currentSlug();

	const mentions = useFileMentions({
		project: projectSlug,
		token: auth.token,
		textarea: () => textarea,
		value: draft,
		onChange: (next) => {
			setDraft(next);
			grow();
		},
	});

	// The composer has its own mic next to Send (a floating one would sit on top of it).
	onSettled(() => {
		if (!form) return;
		return registerDictationTarget(form, {
			insert: (text) => {
				if (textarea) insertIntoField(textarea, text);
			},
			focus: () => textarea?.focus(),
			label: "Message",
			floatingMic: false,
		});
	});

	props.control?.({
		fill: (text) => {
			setDraft(text);
			if (textarea) {
				textarea.value = text;
				grow();
				textarea.focus();
				textarea.setSelectionRange(text.length, text.length);
			}
		},
	});

	function grow(): void {
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
	}

	async function send(): Promise<void> {
		const text = draft().trim();
		if (!text || props.running || props.disabled || sending()) return;
		setSending(true);
		try {
			if (await props.onSend(text)) {
				setDraft("");
				if (textarea) textarea.value = "";
				grow();
			}
		} finally {
			setSending(false);
		}
	}

	return (
		<div class="relative">
			<form
				ref={(el) => {
					form = el;
				}}
				class="relative z-10 rounded-2xl border border-ink/10 bg-canvas shadow-[0_1px_2px_rgb(0_0_0/0.03),0_8px_24px_-12px_rgb(0_0_0/0.12)] transition-colors duration-fast ease-out-grid focus-within:border-ink/20"
				onSubmit={(event) => {
					event.preventDefault();
					void send();
				}}
			>
				<Show when={mentions.open()}>
					<FileMentionPopup
						files={mentions.files()}
						loading={mentions.loading()}
						selectedIndex={mentions.selectedIndex()}
						onSelect={mentions.selectFile}
						onClose={mentions.close}
					/>
				</Show>
				<textarea
					ref={(el) => {
						textarea = el;
					}}
					rows={2}
					value={draft()}
					placeholder={props.placeholder ?? PLACEHOLDER}
					aria-label="Message"
					enterkeyhint="send"
					disabled={props.disabled}
					onInput={(event) => {
						setDraft(event.currentTarget.value);
						grow();
						mentions.handleInput();
					}}
					onKeyUp={mentions.handleCursorMove}
					onClick={mentions.handleCursorMove}
					onKeyDown={(event) => {
						if (mentions.handleKeyDown(event)) return;
						// A physical keyboard sends on Enter; a phone's Enter makes a new line.
						if (
							event.key === "Enter" &&
							!event.shiftKey &&
							!event.isComposing &&
							matchMedia("(pointer: fine)").matches
						) {
							event.preventDefault();
							void send();
						}
					}}
					class="block max-h-50 min-h-12 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-ink text-ui-input outline-none placeholder:text-ink/35"
				/>
				<div class="flex items-center gap-1 px-2 pb-2">
					<div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
						{props.controls}
					</div>
					<MicButton
						target={() =>
							textarea
								? {
										insert: (text) => textarea && insertIntoField(textarea, text),
										focus: () => textarea?.focus(),
										label: "Message",
										floatingMic: false,
									}
								: null
						}
						class={`${ROUND} text-ink/50 hover:bg-ink/6 hover:text-ink aria-pressed:bg-danger aria-pressed:text-canvas`}
					/>
					<Show
						when={props.running}
						fallback={
							<button
								type="submit"
								aria-label="Send"
								disabled={!draft().trim() || props.disabled || sending()}
								class={`${ROUND} bg-primary text-primary-foreground disabled:bg-ink/10 disabled:text-ink/35`}
							>
								<SendIcon class="size-4" />
							</button>
						}
					>
						<button
							type="button"
							aria-label="Stop"
							onClick={() => props.onStop?.()}
							class={`${ROUND} bg-ink/10 text-ink hover:bg-ink/15`}
						>
							<StopSquareIcon class="size-4" />
						</button>
					</Show>
				</div>
			</form>
			{/* Where the agent works, tucked under the card rather than competing with the text. */}
			<Show when={props.header || props.branch}>
				<div class="-mt-3 flex min-w-0 items-center gap-3 rounded-b-2xl border border-ink/8 border-t-0 bg-ink/3 px-4 pt-4 pb-1.5 text-ui-xs pointer-coarse:pb-0.5">
					<Show when={props.header}>
						<span class={CONTEXT_CHIP}>{props.header}</span>
					</Show>
					<Show when={props.branch}>
						{(branch) => (
							<span class={CONTEXT_CHIP}>
								<BranchIcon class="size-3.5 shrink-0" />
								<span class="truncate font-mono">{branch()}</span>
							</span>
						)}
					</Show>
				</div>
			</Show>
		</div>
	);
}
