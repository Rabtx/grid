import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";
import { insertIntoField, MicButton, registerDictationTarget } from "@/modules/voice";
import {
	Attachment,
	AttachIcon,
	IconButton,
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

import { useFileMentions } from "../lib/use-file-mentions";
import { FileMentionPopup } from "./file-mention-popup";

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
	onSend: (text: string, files: File[]) => boolean | Promise<boolean>;
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
	const [files, setFiles] = createSignal<{ file: File; preview?: string }[]>([]);
	const [fileError, setFileError] = createSignal<string | null>(null);
	let picker: HTMLInputElement | undefined;
	function addFiles(incoming: File[]): void {
		if (sending() || props.disabled) return;
		if (incoming.some((file) => file.size > 10 * 1024 * 1024)) {
			setFileError("Each file must be 10 MB or smaller.");
			return;
		}
		setFiles((current) => {
			if (current.length + incoming.length > 20) {
				setFileError("Attach up to 20 files per message.");
				return current;
			}
			setFileError(null);
			return [
				...current,
				...incoming.map((file) => ({
					file,
					preview: /^image\/(png|jpeg|gif|webp)$/.test(file.type)
						? URL.createObjectURL(file)
						: undefined,
				})),
			];
		});
	}
	function clearFiles(): void {
		for (const item of files()) if (item.preview) URL.revokeObjectURL(item.preview);
		setFiles([]);
	}
	onSettled(() => () => {
		for (const item of files()) if (item.preview) URL.revokeObjectURL(item.preview);
	});
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
		if ((!text && !files().length) || props.running || props.disabled || sending()) return;
		setSending(true);
		try {
			if (
				await props.onSend(
					text,
					files().map((item) => item.file),
				)
			) {
				setDraft("");
				clearFiles();
				setFileError(null);
				if (textarea) textarea.value = "";
				grow();
			}
		} catch (cause) {
			setFileError(
				cause instanceof Error ? cause.message : "Could not send attachments. Try again.",
			);
		} finally {
			setSending(false);
		}
	}

	return (
		<PromptBox
			onDragOver={(event) => {
				if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
			}}
			onDrop={(event) => {
				event.preventDefault();
				addFiles(Array.from(event.dataTransfer?.files ?? []));
			}}
			attachments={
				<>
					<For each={files()}>
						{(item) => (
							<Attachment
								name={item.file.name}
								size={item.file.size}
								preview={item.preview}
								disabled={sending()}
								onRemove={() => {
									if (item.preview) URL.revokeObjectURL(item.preview);
									setFiles((current) => current.filter((entry) => entry !== item));
								}}
							/>
						)}
					</For>
					<Show when={sending()}>
						<Text size="caption">Sending…</Text>
					</Show>
					<Show when={fileError()}>
						<Text tone="danger">{fileError()}</Text>
					</Show>
				</>
			}
			formRef={(el) => {
				form = el;
			}}
			onSubmit={() => void send()}
			overlay={
				<Show when={mentions.open()}>
					<FileMentionPopup
						files={mentions.files()}
						loading={mentions.loading()}
						selectedIndex={mentions.selectedIndex()}
						onSelect={mentions.selectFile}
						onClose={mentions.close}
					/>
				</Show>
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
					disabled={props.disabled || sending()}
					onInput={(event) => {
						setDraft(event.currentTarget.value);
						grow();
						mentions.handleInput();
					}}
					onPaste={(event) => {
						const images = Array.from(event.clipboardData?.files ?? []).filter((file) =>
							file.type.startsWith("image/"),
						);
						if (images.length) {
							event.preventDefault();
							addFiles(images);
						}
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
					class={PROMPT_FIELD}
				/>
			}
			tools={
				<>
					<input
						ref={(el) => {
							picker = el;
						}}
						type="file"
						multiple
						hidden
						aria-label="Choose attachments"
						onChange={(event) => {
							addFiles(Array.from(event.currentTarget.files ?? []));
							event.currentTarget.value = "";
						}}
					/>
					<IconButton
						label="Attach files"
						class="min-h-11 min-w-11"
						disabled={props.disabled || sending()}
						onClick={() => picker?.click()}
					>
						<AttachIcon />
					</IconButton>
					{props.controls}
				</>
			}
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
							disabled={(!draft().trim() && !files().length) || props.disabled || sending()}
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
