import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";
import { insertIntoField, MicButton, registerDictationTarget } from "@/modules/voice";
import {
	BranchIcon,
	MIC_BUTTON,
	PROMPT_FIELD,
	PromptBox,
	Row,
	SEND_BUTTON,
	SendIcon,
	STOP_BUTTON,
	StopSquareIcon,
	Text,
} from "@/kit";

import { type SlashCommand, useSlashCommands } from "../lib/slash-commands";
import { useFileMentions } from "../lib/use-file-mentions";
import { FileMentionPopup } from "./file-mention-popup";
import { SlashMenu } from "./slash-menu";

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
	/** Slash commands that apply here: Grid's, plus the agent's own. */
	commands?: readonly SlashCommand[];
	/** Run a picked or typed command; return false to keep the draft so it can be finished. */
	onCommand?: (command: SlashCommand, argument: string) => boolean;
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

	/** Take the field's new text, growing the box with it. */
	function accept(next: string): void {
		setDraft(next);
		grow();
	}

	const mentions = useFileMentions({
		project: projectSlug,
		token: auth.token,
		textarea: () => textarea,
		value: draft,
		onChange: accept,
	});

	/** Empty the box: `/clear`, or a command that has run. */
	function clearDraft(): void {
		setDraft("");
		if (textarea) textarea.value = "";
		grow();
	}

	const slash = useSlashCommands({
		textarea: () => textarea,
		commands: () => props.commands ?? [],
		value: draft,
		onChange: accept,
		run: (command, argument) => {
			// `/clear` needs only the field; every other command belongs to the screen.
			if (command.id === "clear") {
				clearDraft();
				return true;
			}
			return props.onCommand?.(command, argument) ?? false;
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
		// A Grid command runs here, rather than going to the agent.
		const action = slash.handleSend(text);
		if (action === "handled") {
			clearDraft();
			return;
		}
		if (action === "keep") {
			textarea?.focus();
			return;
		}
		setSending(true);
		try {
			if (await props.onSend(text)) clearDraft();
		} finally {
			setSending(false);
		}
	}

	return (
		<PromptBox
			formRef={(el) => {
				form = el;
			}}
			onSubmit={() => void send()}
			overlay={
				<>
					<Show when={mentions.open()}>
						<FileMentionPopup
							files={mentions.files()}
							loading={mentions.loading()}
							selectedIndex={mentions.selectedIndex()}
							onSelect={mentions.selectFile}
							onClose={mentions.close}
						/>
					</Show>
					<Show when={slash.open()}>
						<SlashMenu
							commands={slash.matches()}
							selectedIndex={slash.selectedIndex()}
							onSelect={slash.selectCommand}
						/>
					</Show>
				</>
			}
			field={
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
						slash.handleInput();
					}}
					onKeyUp={() => {
						mentions.handleInput();
						slash.handleInput();
					}}
					onClick={() => {
						mentions.handleInput();
						slash.handleInput();
					}}
					onKeyDown={(event) => {
						if (mentions.handleKeyDown(event)) return;
						if (slash.handleKeyDown(event)) return;
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
					class={PROMPT_FIELD}
				/>
			}
			tools={props.controls}
			options={
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
					class={MIC_BUTTON}
				/>
			}
			send={
				<Show
					when={props.running}
					fallback={
						<button
							type="submit"
							aria-label="Send"
							disabled={!draft().trim() || props.disabled || sending()}
							class={SEND_BUTTON}
						>
							<SendIcon />
						</button>
					}
				>
					<button
						type="button"
						aria-label="Stop"
						onClick={() => props.onStop?.()}
						class={STOP_BUTTON}
					>
						<StopSquareIcon />
					</button>
				</Show>
			}
			tray={
				// Where the agent works, tucked under the card rather than competing with the text.
				props.header || props.branch ? (
					<>
						<Show when={props.header}>
							<Row gap={1.5} class="min-w-0">
								{props.header}
							</Row>
						</Show>
						<Show when={props.branch}>
							{(branch) => (
								<Row gap={1.5}>
									<BranchIcon size="sm" />
									<Text as="span" size="caption" tone="subtle" mono truncate>
										{branch()}
									</Text>
								</Row>
							)}
						</Show>
					</>
				) : undefined
			}
		/>
	);
}
