import { createSignal, onCleanup } from "solid-js";

import { filesService } from "@/modules/projects";

import { filterAndSortFiles, findMentionQuery, insertMention } from "./file-mentions";

export type UseFileMentionsOptions = {
	project: () => string | null | undefined;
	token: () => string | null;
	textarea: () => HTMLTextAreaElement | undefined;
	value: () => string;
	onChange: (nextValue: string) => void;
};

export type UseFileMentionsReturn = {
	open: () => boolean;
	loading: () => boolean;
	query: () => string;
	files: () => string[];
	selectedIndex: () => number;
	setSelectedIndex: (index: number | ((prev: number) => number)) => void;
	selectFile: (file: string) => void;
	close: () => void;
	handleInput: () => void;
	handleCursorMove: () => void;
	handleKeyDown: (event: KeyboardEvent) => boolean;
};

export function useFileMentions(options: UseFileMentionsOptions): UseFileMentionsReturn {
	const [open, setOpen] = createSignal(false);
	const [loading, setLoading] = createSignal(false);
	const [query, setQuery] = createSignal("");
	const [atIndex, setAtIndex] = createSignal(-1);
	const [files, setFiles] = createSignal<string[]>([]);
	const [selectedIndex, setSelectedIndex] = createSignal(0);

	let dismissedAtIndex = -1;
	let reqId = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let cachedProject = "";
	let cachedFiles: string[] = [];

	onCleanup(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
	});

	function close(): void {
		setOpen(false);
		dismissedAtIndex = atIndex();
		if (debounceTimer) clearTimeout(debounceTimer);
		setLoading(false);
	}

	function selectFile(file: string): void {
		const ta = options.textarea();
		if (!ta) return;

		const currentVal = ta.value;
		const cursor = ta.selectionStart ?? currentVal.length;
		const at = atIndex();

		const result = insertMention(currentVal, at, cursor, file);
		options.onChange(result.text);

		setOpen(false);
		dismissedAtIndex = -1;

		// Move cursor immediately after the inserted mention
		queueMicrotask(() => {
			ta.focus();
			ta.setSelectionRange(result.newCursorPosition, result.newCursorPosition);
		});
	}

	async function fetchFiles(slug: string, q: string): Promise<void> {
		const token = options.token();
		if (!token) return;

		const currentReq = ++reqId;
		setLoading(true);

		try {
			const res = await filesService.search(token, slug, q);
			if (currentReq !== reqId) return;

			const fileList = res ?? [];
			if (slug !== cachedProject) {
				cachedProject = slug;
				cachedFiles = fileList;
			} else if (!q && fileList.length > 0) {
				cachedFiles = fileList;
			}

			setFiles(fileList);
			setSelectedIndex(0);
		} catch {
			if (currentReq !== reqId) return;
			// Fallback to locally filtered cached files if server request failed
			if (cachedProject === slug && cachedFiles.length > 0) {
				setFiles(filterAndSortFiles(cachedFiles, q));
			} else {
				setFiles([]);
			}
		} finally {
			if (currentReq === reqId) setLoading(false);
		}
	}

	function queueFetch(slug: string, q: string): void {
		if (debounceTimer) clearTimeout(debounceTimer);

		// If we have cached files for this project, filter immediately for instant feedback
		if (cachedProject === slug && cachedFiles.length > 0) {
			setFiles(filterAndSortFiles(cachedFiles, q));
			setSelectedIndex(0);
		}

		debounceTimer = setTimeout(() => {
			void fetchFiles(slug, q);
		}, 150);
	}

	function checkMention(): void {
		const ta = options.textarea();
		if (!ta) {
			setOpen(false);
			return;
		}

		const cursor = ta.selectionStart ?? 0;
		const selEnd = ta.selectionEnd ?? 0;
		if (cursor !== selEnd) {
			setOpen(false);
			return;
		}

		const text = ta.value;
		const match = findMentionQuery(text, cursor);
		if (!match) {
			setOpen(false);
			dismissedAtIndex = -1;
			return;
		}

		// If this exact mention was dismissed with Escape and query hasn't changed, stay closed
		if (match.atIndex === dismissedAtIndex && match.query === query() && !open()) {
			return;
		}

		const slug = options.project();
		if (!slug) {
			setOpen(false);
			return;
		}

		const isNewMention = match.atIndex !== atIndex() || !open();
		setAtIndex(match.atIndex);
		setQuery(match.query);
		setOpen(true);

		if (isNewMention) {
			dismissedAtIndex = -1;
			setSelectedIndex(0);
		}

		queueFetch(slug, match.query);
	}

	function handleKeyDown(event: KeyboardEvent): boolean {
		if (!open()) return false;

		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
			return true;
		}

		const list = files();
		if (list.length === 0) return false;

		if (event.key === "ArrowDown") {
			event.preventDefault();
			setSelectedIndex((i) => (i + 1) % list.length);
			return true;
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			setSelectedIndex((i) => (i - 1 + list.length) % list.length);
			return true;
		}

		if ((event.key === "Enter" || event.key === "Tab") && !event.isComposing) {
			event.preventDefault();
			event.stopPropagation();
			const selected = list[selectedIndex()];
			if (selected) {
				selectFile(selected);
			}
			return true;
		}

		return false;
	}

	return {
		open,
		loading,
		query,
		files,
		selectedIndex,
		setSelectedIndex,
		selectFile,
		close,
		handleInput: checkMention,
		handleCursorMove: checkMention,
		handleKeyDown,
	};
}
