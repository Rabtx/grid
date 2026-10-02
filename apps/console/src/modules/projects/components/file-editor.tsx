import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, onSettled, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import {
	Alert,
	Button,
	CloseIcon,
	CodeEditor,
	ConfirmDialog,
	DiffCard,
	Dialog,
	EmptyState,
	IconButton,
	notify,
	PanelBar,
	Segmented,
	Spinner,
	StatusDot,
} from "@/kit";
import { diffLines } from "@/kit/diff";

import { filesService, isFileConflict, type ProjectFileContent } from "../services/files.service";

/** Which of the two views the editor shows: the text, or the changes against what was read. */
type View = "text" | "changes";

/**
 * A project file, open for editing. The text is the kit's editor, which loads only now — reading
 * a file never pulls an editor down — and a save goes to the runner carrying the version the text
 * was read at, so a file that changed in the meantime is refused rather than overwritten. That
 * refusal is a question, not an error: take the file from disk, or put this edit on top of it.
 *
 * The draft lives here, so leaving is this component's business: unsaved changes are confirmed
 * before they are thrown away, and the browser is warned too.
 */
export function FileEditor(props: {
	slug: string;
	/** The file as it was read: the text to edit, and the version a save is based on. */
	file: ProjectFileContent;
	/** Tell the tree this file has unsaved changes, so its row carries a dirty dot. */
	onDirty: (dirty: boolean) => void;
	/** The file as a save or a reload left it, so the reader (and the next edit) starts from it. */
	onSaved?: (file: ProjectFileContent) => void;
	/** Leave editing. */
	onClose: () => void;
}): JSX.Element {
	const auth = useAuth();
	/**
	 * The file's text as it is last known to be on disk: what it was read as, and whatever a save
	 * or a reload last confirmed. The draft is compared against this, and so is the Changes view —
	 * "unsaved" means "differs from what is on disk", not "differs from what was opened".
	 */
	const [onDisk, setOnDisk] = createSignal(untrack(() => props.file.text ?? ""));
	const [draft, setDraft] = createSignal(untrack(() => props.file.text ?? ""));
	const [view, setView] = createSignal<View>("text");
	const [saving, setSaving] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [conflict, setConflict] = createSignal<string | null>(null);
	const [leaving, setLeaving] = createSignal(false);
	/** The version the next save is based on; a reload or an overwrite moves it. */
	const [base, setBase] = createSignal(untrack(() => props.file.hash));
	/** Bumped to push text into the editor from outside: a reload, or a save. */
	const [revision, setRevision] = createSignal(0);

	const dirty = () => draft() !== onDisk();
	// A memo, so the diff is worked out in a tracking scope rather than while the view is drawn.
	const changes = createMemo(() => diffLines(onDisk(), draft()));

	// Another file arrives, or a re-read while nothing is unsaved: the draft follows it. A re-read
	// of the same file never replaces an edit still being made.
	let shown = untrack(() => props.file.path);
	createEffect(
		() => [props.file.path, props.file.text, props.file.hash] as const,
		([path, text, hash]) => {
			if (text === null) return;
			if (path === shown && untrack(dirty)) return;
			shown = path;
			setOnDisk(text);
			setDraft(text);
			setBase(hash);
		},
	);

	// Unsaved work belongs to the browser tab too, so closing it asks first.
	createEffect(
		() => dirty(),
		(unsaved) => {
			if (!unsaved) return;
			const warn = (event: BeforeUnloadEvent) => event.preventDefault();
			window.addEventListener("beforeunload", warn);
			return () => window.removeEventListener("beforeunload", warn);
		},
	);

	// Unmounted with a draft (another file, a route change): the tree's dirty dot goes with it.
	onSettled(() => () => props.onDirty(false));

	function change(text: string): void {
		setDraft(text);
		props.onDirty(text !== onDisk());
	}

	/** Read the file, so an edit can be checked against a version that is really on disk. */
	async function current(): Promise<ProjectFileContent | null> {
		const token = auth.token();
		if (!token) return null;
		try {
			return await filesService.read(token, props.slug, props.file.path);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not read this file again");
			return null;
		}
	}

	/** Put the draft back, onto the version it was based on. */
	async function save(against = base()): Promise<boolean> {
		const token = auth.token();
		if (!token || saving() || !dirty() || !against) return false;
		setSaving(true);
		setError(null);
		try {
			const saved = await filesService.save(token, props.slug, props.file.path, draft(), against);
			const written = saved.text ?? draft();
			setOnDisk(written);
			setDraft(written);
			setBase(saved.hash);
			setRevision((count) => count + 1);
			props.onDirty(false);
			props.onSaved?.({ ...saved, text: written });
			notify({ title: `Saved ${props.file.name}` });
			return true;
		} catch (cause) {
			if (isFileConflict(cause)) setConflict(cause.message);
			else setError(cause instanceof Error ? cause.message : "Could not save this file");
			return false;
		} finally {
			setSaving(false);
		}
	}

	/** Read the file again and show it, throwing this edit away. */
	async function reload(): Promise<void> {
		setSaving(true);
		setConflict(null);
		try {
			const fresh = await current();
			if (!fresh) return;
			if (fresh.text === null) {
				setError("This file is no longer a text file");
				return;
			}
			setOnDisk(fresh.text);
			setDraft(fresh.text);
			setBase(fresh.hash);
			setRevision((count) => count + 1);
			props.onDirty(false);
			props.onSaved?.(fresh);
			notify({ title: `Reloaded ${props.file.name}` });
		} finally {
			setSaving(false);
		}
	}

	/**
	 * Put this edit on top of whatever is on disk now. The file is read first, so the save is
	 * still checked against a real version rather than forced: if it moves again, the question is
	 * asked once more.
	 */
	async function overwrite(): Promise<void> {
		const fresh = await current();
		if (!fresh?.hash) {
			// No file means `current` already said why; a file without a hash is not text any more.
			if (fresh) setError("This file is no longer a text file");
			return;
		}
		setConflict(null);
		setSaving(false);
		await save(fresh.hash);
	}

	function close(): void {
		if (dirty()) setLeaving(true);
		else props.onClose();
	}

	return (
		<>
			<PanelBar
				actions={
					<>
						<Show when={dirty()}>
							<StatusDot status="busy" size="sm" label="Unsaved changes" />
						</Show>
						<Show when={saving()}>
							<Spinner class="size-4" label="Saving" />
						</Show>
						<Show when={dirty() && !saving()}>
							<Button size="sm" variant="primary" onClick={() => void save()}>
								Save
							</Button>
						</Show>
						<IconButton size="sm" label="Close the editor" onClick={close}>
							<CloseIcon />
						</IconButton>
					</>
				}
			>
				<Segmented<View>
					size="sm"
					label="File view"
					options={[
						{ value: "text", label: "Text" },
						{ value: "changes", label: "Changes" },
					]}
					value={view()}
					onChange={setView}
				/>
			</PanelBar>
			<Show when={error()}>
				{(text) => (
					<div class="px-3 pt-3">
						<Alert tone="danger" title={text()} />
					</div>
				)}
			</Show>
			<Show when={view() === "text"}>
				<CodeEditor
					value={draft()}
					path={props.file.path}
					revision={revision()}
					placeholder="This file is empty."
					onChange={change}
					onSave={() => void save()}
				/>
			</Show>
			<Show when={view() === "changes"}>
				<div class="min-h-0 flex-1 overflow-auto overscroll-contain p-3 pb-safe">
					<Show
						when={dirty()}
						fallback={
							<EmptyState
								title="No unsaved changes"
								description="What you type shows up here, against the file as it is on disk."
							/>
						}
					>
						<DiffCard path={props.file.path} lines={changes()} />
					</Show>
				</div>
			</Show>
			<Show when={leaving()}>
				<ConfirmDialog
					open
					onClose={() => setLeaving(false)}
					onConfirm={props.onClose}
					title="Leave without saving?"
					description={`${props.file.name} has changes that are not saved. Leaving now throws them away.`}
					confirm="Discard changes"
					danger
				/>
			</Show>
			<Show when={conflict()}>
				{(text) => (
					<Dialog
						open
						onClose={() => setConflict(null)}
						title="This file changed on disk"
						description={`${text()}. Reload to work on what is there now, or overwrite to put this edit on top of it.`}
						width="28rem"
						footer={
							<>
								<Button onClick={() => void reload()} disabled={saving()}>
									Reload from disk
								</Button>
								<Button variant="primary" onClick={() => void overwrite()} disabled={saving()}>
									Overwrite
								</Button>
							</>
						}
					>
						<p class="text-body text-fg-muted">
							Your edit is still here. Nothing has been written yet.
						</p>
					</Dialog>
				)}
			</Show>
		</>
	);
}
