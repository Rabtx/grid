import type { JSX } from "@solidjs/web";
import { useParams } from "@solidjs/router";
import {
	createEffect,
	createSignal,
	createUniqueId,
	For,
	onSettled,
	Show,
	untrack,
} from "solid-js";

import { useAuth } from "@/modules/auth";
import { placementsStore } from "@/modules/environments";
import { useWorkspace } from "@/modules/projects";
import { dictation, insertIntoField, MicButton, registerDictationTarget } from "@/modules/voice";
import {
	AttachIcon,
	Attachment,
	BranchIcon,
	CameraIcon,
	EditIcon,
	FolderIcon,
	ImageIcon,
	Menu,
	type MenuGroup,
	type MenuItem,
	MIC_BUTTON,
	PlusIcon,
	PROMPT_FIELD,
	PROMPT_ADD,
	PromptBox,
	PromptHints,
	Row,
	SEND_BUTTON,
	SendIcon,
	SpinnerIcon,
	STOP_BUTTON,
	WorkingRing,
	StopSquareIcon,
	TerminalIcon,
	Text,
	UploadIcon,
	VoiceBar,
} from "@/kit";

import {
	appendProjectReferences,
	isImageFile,
	validateIncomingFiles,
	type AttachedFile,
} from "../lib/attachments";
import { type SlashCommand, useSlashCommands } from "../lib/slash-commands";
import { useFileMentions } from "../lib/use-file-mentions";
import { chatService } from "../services/chat.service";
import { AttachmentPreviewDialog } from "./attachment-preview-dialog";
import { AttachmentProjectPicker } from "./attachment-project-picker";
import { FileMentionPopup } from "./file-mention-popup";
import { SlashMenu } from "./slash-menu";

/** Put text in the composer from outside it: a suggestion picked on the new-chat screen. */
export type ComposerControl = { fill: (text: string) => void };

/** What the field asks for until the caller says otherwise. */
const PLACEHOLDER = "Ask, build, / for commands, @ for references…";

const isTouchDevice = () => {
	if (typeof window === "undefined") return false;
	if (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0) return true;
	if (typeof window.matchMedia === "function") {
		return window.matchMedia("(pointer: coarse)").matches;
	}
	return false;
};

/**
 * Where a message is written. Enter sends on a physical keyboard (Shift+Enter for a new line);
 * on a phone Enter is a new line and the send button sends. While the agent works, the button
 * stops it. A text field, so voice input lands here with no extra wiring.
 */
export function Composer(props: {
	placeholder?: string;
	running: boolean;
	disabled?: boolean;
	sessionId?: string;
	scope?: string;
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
	/** Slash commands that apply here: Grid's, plus the agent's own. */
	commands?: readonly SlashCommand[];
	/** Run a picked or typed command; return false to keep the draft so it can be finished. */
	onCommand?: (command: SlashCommand, argument: string) => boolean;
	/** Hands over a way to fill the field from outside. */
	control?: (control: ComposerControl) => void;
}): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const params = useParams<{ id?: string; project?: string }>();

	const [draft, setDraft] = createSignal(untrack(() => props.initial) ?? "");
	const [sending, setSending] = createSignal(false);
	const [files, setFiles] = createSignal<AttachedFile[]>([]);
	const [projectFiles, setProjectFiles] = createSignal<string[]>([]);
	const [fileError, setFileError] = createSignal<string | null>(null);
	const [isDraggingOver, setIsDraggingOver] = createSignal(false);
	const [projectPickerOpen, setProjectPickerOpen] = createSignal(false);
	const [previewTarget, setPreviewTarget] = createSignal<{
		name: string;
		size?: number;
		preview?: string;
	} | null>(null);

	let filePicker: HTMLInputElement | undefined;
	let photoPicker: HTMLInputElement | undefined;
	let cameraPicker: HTMLInputElement | undefined;
	let textarea: HTMLTextAreaElement | undefined;
	let form: HTMLFormElement | undefined;

	const projectSlug = () => props.project ?? workspace.currentSlug();
	const activeSessionId = () =>
		props.sessionId ?? (params.id && params.id !== "new" ? params.id : undefined);
	const activeScope = () => props.scope ?? placementsStore.scopeOf(projectSlug() ?? "");

	const hasPendingUploads = () => files().some((item) => item.status === "uploading");
	const hasUploadErrors = () => files().some((item) => item.status === "error");

	async function startUpload(entry: AttachedFile, token: string, sid: string): Promise<void> {
		const controller = new AbortController();
		entry.controller = controller;

		setFiles((current) =>
			current.map((item) =>
				item.id === entry.id
					? { ...item, status: "uploading", progress: 0, error: null, controller }
					: item,
			),
		);

		try {
			await chatService.uploadOne(token, sid, entry.file, activeScope(), {
				signal: controller.signal,
				onProgress: (percent) => {
					setFiles((current) =>
						current.map((item) => (item.id === entry.id ? { ...item, progress: percent } : item)),
					);
				},
			});
			setFiles((current) =>
				current.map((item) =>
					item.id === entry.id ? { ...item, status: "uploaded", progress: 100, error: null } : item,
				),
			);
		} catch (cause) {
			if (controller.signal.aborted) return;
			const message = cause instanceof Error ? cause.message : "Upload failed";
			setFiles((current) =>
				current.map((item) =>
					item.id === entry.id ? { ...item, status: "error", error: message } : item,
				),
			);
		}
	}

	function addFiles(incoming: File[]): void {
		if (sending() || props.disabled) return;
		const currentCount = files().length;
		const validation = validateIncomingFiles(incoming, currentCount);
		if (validation.error) {
			setFileError(validation.error);
			return;
		}
		setFileError(null);

		const newEntries: AttachedFile[] = validation.valid.map((file) => ({
			id: createUniqueId(),
			file,
			name: file.name,
			size: file.size,
			preview: isImageFile(file) ? URL.createObjectURL(file) : undefined,
			status: "idle",
			progress: 0,
			error: null,
		}));

		setFiles((current) => [...current, ...newEntries]);

		const token = auth.token();
		const sid = activeSessionId();
		if (token && sid) {
			for (const entry of newEntries) {
				void startUpload(entry, token, sid);
			}
		}
	}

	function removeFile(item: AttachedFile): void {
		if (item.controller) item.controller.abort();
		chatService.clearUpload(item.file);
		if (item.preview) URL.revokeObjectURL(item.preview);
		setFiles((current) => current.filter((entry) => entry.id !== item.id));
		if (fileError() && files().length <= 20) setFileError(null);
	}

	function retryFile(item: AttachedFile): void {
		const token = auth.token();
		const sid = activeSessionId();
		if (token && sid) {
			void startUpload(item, token, sid);
		}
	}

	function clearFiles(): void {
		for (const item of files()) {
			if (item.controller) item.controller.abort();
			chatService.clearUpload(item.file);
			if (item.preview) URL.revokeObjectURL(item.preview);
		}
		setFiles([]);
	}

	onSettled(() => () => {
		clearFiles();
	});

	// Global drop listener so dropping anywhere on the conversation window attaches files
	onSettled(() => {
		let dragCounter = 0;
		function onDragEnter(e: DragEvent) {
			if (e.dataTransfer?.types.includes("Files")) {
				dragCounter++;
				setIsDraggingOver(true);
			}
		}
		function onDragLeave(e: DragEvent) {
			if (e.dataTransfer?.types.includes("Files")) {
				dragCounter--;
				if (dragCounter <= 0) {
					dragCounter = 0;
					setIsDraggingOver(false);
				}
			}
		}
		function onDragOver(e: DragEvent) {
			if (e.dataTransfer?.types.includes("Files")) {
				e.preventDefault();
			}
		}
		function onDrop(e: DragEvent) {
			if (e.defaultPrevented) return;
			if (e.dataTransfer?.types.includes("Files")) {
				e.preventDefault();
				dragCounter = 0;
				setIsDraggingOver(false);
				const dropped = Array.from(e.dataTransfer?.files ?? []);
				if (dropped.length) addFiles(dropped);
			}
		}
		window.addEventListener("dragenter", onDragEnter);
		window.addEventListener("dragleave", onDragLeave);
		window.addEventListener("dragover", onDragOver);
		window.addEventListener("drop", onDrop);
		return () => {
			window.removeEventListener("dragenter", onDragEnter);
			window.removeEventListener("dragleave", onDragLeave);
			window.removeEventListener("dragover", onDragOver);
			window.removeEventListener("drop", onDrop);
		};
	});

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
			if (command.id === "clear") {
				clearDraft();
				return true;
			}
			return props.onCommand?.(command, argument) ?? false;
		},
	});

	// The open list's ids, so the field can say which item is picked.
	const listId = createUniqueId();
	const slashId = `${listId}-commands`;
	const mentionsId = `${listId}-files`;
	const openList = (): { id: string; active: number; count: number } | null => {
		if (mentions.open())
			return { id: mentionsId, active: mentions.selectedIndex(), count: mentions.files().length };
		if (slash.open())
			return { id: slashId, active: slash.selectedIndex(), count: slash.matches().length };
		return null;
	};

	// Dictation into this box draws its recording bar here, not the app-wide bubble.
	const voiceOwner = {};
	const voiceTarget = {
		insert: (text: string) => {
			if (textarea) insertIntoField(textarea, text);
		},
		focus: () => textarea?.focus(),
		label: "Message",
		floatingMic: false,
		owner: voiceOwner,
	};
	const dictating = () => dictation.status() !== "idle" && dictation.owner() === voiceOwner;

	// The field is hidden while the bar shows; when it ends, the cursor goes back into it.
	let wasDictating = false;
	createEffect(dictating, (now) => {
		if (wasDictating && !now) requestAnimationFrame(() => textarea?.focus());
		wasDictating = now;
	});

	// Leaving with the bar open (another thread, another screen) would leave nothing to stop it.
	onSettled(() => () => {
		if (dictation.owner() === voiceOwner) dictation.cancel();
	});

	onSettled(() => {
		if (!form) return;
		return registerDictationTarget(form, voiceTarget);
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

	function triggerMention(): void {
		if (!textarea) return;
		const val = draft();
		const cursor = textarea.selectionStart ?? val.length;
		const before = val.slice(0, cursor);
		const after = val.slice(cursor);
		const needsSpace = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
		const insertion = needsSpace ? " @" : "@";
		const next = `${before}${insertion}${after}`;
		const newCursor = cursor + insertion.length;
		textarea.value = next;
		accept(next);
		textarea.focus();
		textarea.setSelectionRange(newCursor, newCursor);
		mentions.handleInput();
	}

	function triggerCommand(): void {
		if (!textarea) return;
		const val = draft();
		if (!val.startsWith("/")) {
			const next = `/${val}`;
			textarea.value = next;
			accept(next);
			textarea.focus();
			textarea.setSelectionRange(1, 1);
		} else {
			textarea.focus();
			textarea.setSelectionRange(1, 1);
		}
		slash.handleInput();
	}

	function handleMenuSelect(id: string): void {
		if (id === "files") {
			filePicker?.click();
		} else if (id === "photo") {
			photoPicker?.click();
		} else if (id === "camera") {
			cameraPicker?.click();
		} else if (id === "project") {
			setProjectPickerOpen(true);
		} else if (id === "mention") {
			triggerMention();
		} else if (id === "commands") {
			triggerCommand();
		}
	}

	const plusMenuGroups = (): MenuGroup[] => {
		const add: MenuItem[] = [];
		if (isTouchDevice()) {
			add.push(
				{ id: "photo", label: "Photos", icon: <ImageIcon />, tone: "accent" },
				{ id: "camera", label: "Camera", icon: <CameraIcon />, tone: "violet" },
			);
		}
		add.push(
			{
				id: "files",
				label: isTouchDevice() ? "Files" : "Upload files",
				icon: <AttachIcon />,
				tone: "success",
				shortcut: "Mod U",
			},
			{
				id: "project",
				label: isTouchDevice() ? "Project" : "Add from project",
				icon: <FolderIcon />,
				tone: "warning",
				disabled: !projectSlug(),
			},
		);

		return [
			{ look: "tiles", items: add },
			{
				items: [
					{
						id: "mention",
						label: "Mention a file",
						description: "Type @ in the composer",
						icon: <EditIcon size="sm" />,
						shortcut: "@",
					},
					{
						id: "commands",
						label: "Commands",
						description: "Type / in the composer",
						icon: <TerminalIcon size="sm" />,
						shortcut: "/",
					},
				],
			},
		];
	};

	async function send(): Promise<void> {
		if (hasPendingUploads()) return;
		const text = draft().trim();
		const attached = files();
		const refs = projectFiles();

		if ((!text && !attached.length && !refs.length) || props.disabled) return;

		if (hasUploadErrors()) {
			setFileError("Resolve failed uploads before sending.");
			return;
		}

		if (text && !attached.length && !refs.length && props.onCommand) {
			const action = slash.handleSend(text);
			if (action === "handled") {
				clearDraft();
				return;
			}
			if (action === "keep") {
				textarea?.focus();
				return;
			}
		}

		if (props.running || sending()) return;
		setSending(true);

		const fullText = appendProjectReferences(text, refs);

		try {
			if (
				await props.onSend(
					fullText,
					attached.map((item) => item.file),
				)
			) {
				clearDraft();
				clearFiles();
				setProjectFiles([]);
				setFileError(null);
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
		<>
			<div class="relative">
				<PromptBox
					onDragOver={(event) => {
						if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
					}}
					onDrop={(event) => {
						event.preventDefault();
						event.stopPropagation();
						addFiles(Array.from(event.dataTransfer?.files ?? []));
					}}
					attachments={
						files().length > 0 || projectFiles().length > 0 || sending() || fileError() ? (
							<>
								<For each={projectFiles()}>
									{(path) => (
										<Attachment
											name={path}
											reference
											disabled={sending()}
											onRemove={() =>
												setProjectFiles((current) => current.filter((p) => p !== path))
											}
										/>
									)}
								</For>
								<For each={files()}>
									{(item) => (
										<Attachment
											name={item.name}
											size={item.size}
											preview={item.preview}
											progress={item.status === "uploading" ? item.progress : undefined}
											error={item.status === "error" ? item.error : null}
											onRetry={() => retryFile(item)}
											onOpen={
												item.preview
													? () =>
															setPreviewTarget({
																name: item.name,
																size: item.size,
																preview: item.preview,
															})
													: undefined
											}
											disabled={sending()}
											onRemove={() => removeFile(item)}
										/>
									)}
								</For>
								<Show when={hasPendingUploads()}>
									<Row gap={1} class="text-caption text-fg-subtle">
										<SpinnerIcon class="size-3 animate-spin" />
										<span>Uploading files…</span>
									</Row>
								</Show>
								<Show when={sending()}>
									<Text size="caption">Sending…</Text>
								</Show>
								<Show when={fileError()}>
									<Text tone="danger">{fileError()}</Text>
								</Show>
							</>
						) : undefined
					}
					formRef={(el) => {
						form = el;
					}}
					voice={
						dictating() ? (
							<VoiceBar
								startedAt={dictation.startedAt() ?? Date.now()}
								levels={dictation.levels()}
								heard={dictation.interim()}
								transcribing={dictation.status() === "transcribing"}
								onCancel={() => dictation.cancel()}
								onDone={() => dictation.toggle(voiceTarget)}
							/>
						) : undefined
					}
					onSubmit={() => void send()}
					overlay={
						<>
							<Show when={mentions.open()}>
								<FileMentionPopup
									id={mentionsId}
									project={projectSlug()}
									files={mentions.files()}
									loading={mentions.loading()}
									selectedIndex={mentions.selectedIndex()}
									onSelect={mentions.selectFile}
									onClose={mentions.close}
								/>
							</Show>
							<Show when={slash.open()}>
								<SlashMenu
									id={slashId}
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
							aria-controls={openList()?.id}
							aria-activedescendant={(() => {
								const list = openList();
								return list && list.count > 0 ? `${list.id}-${list.active}` : undefined;
							})()}
							enterkeyhint="send"
							disabled={props.disabled || sending()}
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
							onPaste={(event) => {
								const pastedFiles = Array.from(event.clipboardData?.files ?? []);
								if (pastedFiles.length) {
									event.preventDefault();
									addFiles(pastedFiles);
								}
							}}
							onKeyDown={(event) => {
								if (mentions.handleKeyDown(event)) return;
								if (slash.handleKeyDown(event)) return;
								if (
									(event.metaKey || event.ctrlKey) &&
									!event.shiftKey &&
									!event.altKey &&
									event.key.toLowerCase() === "u"
								) {
									event.preventDefault();
									filePicker?.click();
									return;
								}
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
									filePicker = el;
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
							<input
								ref={(el) => {
									cameraPicker = el;
								}}
								type="file"
								accept="image/*"
								capture="environment"
								hidden
								aria-label="Take a photo"
								onChange={(event) => {
									addFiles(Array.from(event.currentTarget.files ?? []));
									event.currentTarget.value = "";
								}}
							/>
							<input
								ref={(el) => {
									photoPicker = el;
								}}
								type="file"
								accept="image/*"
								multiple
								hidden
								aria-label="Choose photos"
								onChange={(event) => {
									addFiles(Array.from(event.currentTarget.files ?? []));
									event.currentTarget.value = "";
								}}
							/>
							<Menu
								label="Add or attach"
								title="Add to message"
								width="md:w-64"
								placement="top-start"
								triggerClass={PROMPT_ADD}
								trigger={<PlusIcon class="size-4" />}
								groups={plusMenuGroups()}
								onSelect={handleMenuSelect}
							/>
							{props.controls}
						</>
					}
					options={<MicButton target={() => (textarea ? voiceTarget : null)} class={MIC_BUTTON} />}
					send={
						<Show
							when={props.running}
							fallback={
								<button
									type="submit"
									aria-label={hasPendingUploads() ? "Uploading attachments…" : "Send"}
									title={hasPendingUploads() ? "Waiting for uploads to finish…" : undefined}
									disabled={
										(!draft().trim() && !files().length && !projectFiles().length) ||
										props.disabled ||
										sending() ||
										hasPendingUploads() ||
										hasUploadErrors()
									}
									class={SEND_BUTTON}
								>
									<Show when={hasPendingUploads()} fallback={<SendIcon />}>
										<SpinnerIcon class="size-4 animate-spin" />
									</Show>
								</button>
							}
						>
							<button
								type="button"
								aria-label="Stop"
								onClick={() => props.onStop?.()}
								class={STOP_BUTTON}
							>
								<WorkingRing />
								<StopSquareIcon />
							</button>
						</Show>
					}
					tray={
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
				<PromptHints />
				<Show when={isDraggingOver()}>
					<div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface/90 ring-2 ring-accent">
						<Row gap={2} class="font-medium text-accent">
							<UploadIcon class="size-5" />
							<span>Drop files to attach</span>
						</Row>
					</div>
				</Show>
			</div>

			<Show when={previewTarget()}>
				{(target) => (
					<AttachmentPreviewDialog
						open={true}
						name={target().name}
						size={target().size}
						preview={target().preview}
						onClose={() => setPreviewTarget(null)}
					/>
				)}
			</Show>

			<Show when={projectPickerOpen()}>
				<AttachmentProjectPicker
					open={true}
					project={projectSlug()}
					token={auth.token}
					onClose={() => setProjectPickerOpen(false)}
					onSelect={(path) =>
						setProjectFiles((current) => (current.includes(path) ? current : [...current, path]))
					}
				/>
			</Show>
		</>
	);
}
