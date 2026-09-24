import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show, untrack } from "solid-js";

import { insertIntoField, MicButton, registerDictationTarget } from "@/modules/voice";
import { BranchIcon, PlusIcon, SendIcon, StopSquareIcon } from "@/ui";

/** A 24px chip on the context row — 44px for a thumb. */
const CONTEXT_CHIP =
	"flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-sm px-1 text-ink/55 transition-colors duration-fast ease-out-grid hover:bg-ink/8 pointer-coarse:h-8";

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
}): JSX.Element {
	const [draft, setDraft] = createSignal(untrack(() => props.initial) ?? "");
	const [sending, setSending] = createSignal(false);
	let textarea: HTMLTextAreaElement | undefined;
	let form: HTMLFormElement | undefined;

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

	function grow(): void {
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
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
		<form
			ref={(el) => {
				form = el;
			}}
			class="rounded-lg border border-ink/10 bg-ink/3 backdrop-blur-sm transition-colors duration-fast ease-out-grid focus-within:border-ink/20"
			onSubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			<Show when={props.header || props.branch}>
				<div class="flex flex-wrap items-center gap-2.5 px-3 pt-2.5 text-ui-xs">
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
			<textarea
				ref={(el) => {
					textarea = el;
				}}
				rows={1}
				value={draft()}
				placeholder={props.placeholder ?? PLACEHOLDER}
				aria-label="Message"
				enterkeyhint="send"
				disabled={props.disabled}
				onInput={(event) => {
					setDraft(event.currentTarget.value);
					grow();
				}}
				onKeyDown={(event) => {
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
				class="block max-h-40 w-full resize-none bg-transparent px-3 py-3 text-ink text-ui-input outline-none placeholder:text-ink/35"
			/>
			<div class="flex items-center gap-1 px-2 pb-2">
				<button
					type="button"
					disabled
					title="Attachments are not available yet"
					aria-label="Attach"
					class="focus-ring grid size-[26px] shrink-0 place-items-center rounded-md bg-selection text-ink/55 transition-colors duration-fast ease-out-grid hover:bg-selection-hover disabled:opacity-40 pointer-coarse:size-11"
				>
					<PlusIcon class="size-4" />
				</button>
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
					class="focus-ring grid size-8 shrink-0 place-items-center rounded-lg text-ink/55 transition-colors duration-fast ease-out-grid hover:bg-ink/8 hover:text-ink aria-pressed:bg-danger aria-pressed:text-canvas pointer-coarse:size-10"
				/>
				<Show
					when={props.running}
					fallback={
						<button
							type="submit"
							aria-label="Send"
							disabled={!draft().trim() || props.disabled || sending()}
							class="focus-ring grid size-[26px] shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-[opacity,transform] duration-fast ease-out-grid active:scale-95 disabled:opacity-30 pointer-coarse:size-11"
						>
							<SendIcon class="size-4" />
						</button>
					}
				>
					<button
						type="button"
						aria-label="Stop"
						onClick={() => props.onStop?.()}
						class="focus-ring grid size-[26px] shrink-0 place-items-center rounded-md bg-ink/10 text-ink transition-transform duration-fast ease-out-grid active:scale-95 pointer-coarse:size-11"
					>
						<StopSquareIcon class="size-4" />
					</button>
				</Show>
			</div>
		</form>
	);
}
