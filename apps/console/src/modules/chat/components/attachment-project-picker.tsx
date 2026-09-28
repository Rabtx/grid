import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import { Dialog, FileIcon, Kbd, Palette } from "@/kit";
import { filesService } from "@/modules/projects";

function fileName(path: string): string {
	return path.split("/").pop() ?? path;
}

function fileDir(path: string): string {
	const parts = path.split("/");
	parts.pop();
	return parts.length > 0 ? parts.join("/") : "";
}

export function AttachmentProjectPicker(props: {
	open: boolean;
	project: string | null | undefined;
	token: () => string | null;
	onClose: () => void;
	onSelect: (path: string) => void;
}): JSX.Element {
	const [query, setQuery] = createSignal("");
	const [files, setFiles] = createSignal<string[]>([]);
	const [active, setActive] = createSignal<string | null>(null);
	const [loading, setLoading] = createSignal(false);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let cachedProject = "";
	let cachedFiles: string[] = [];

	onCleanup(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
	});

	async function loadFiles(slug: string, q: string): Promise<void> {
		const token = props.token();
		if (!token) return;
		setLoading(true);
		try {
			const res = await filesService.search(token, slug, q);
			const list = res ?? [];
			if (slug !== cachedProject) {
				cachedProject = slug;
				cachedFiles = list;
			} else if (!q && list.length > 0) {
				cachedFiles = list;
			}
			setFiles(list);
			setActive(list[0] ?? null);
		} catch {
			if (cachedProject === slug && cachedFiles.length > 0) {
				const lower = q.toLowerCase();
				const filtered = cachedFiles.filter((f) => f.toLowerCase().includes(lower));
				setFiles(filtered);
				setActive(filtered[0] ?? null);
			} else {
				setFiles([]);
				setActive(null);
			}
		} finally {
			setLoading(false);
		}
	}

	createEffect(
		() => [props.open, props.project, query()] as const,
		([open, project, q]) => {
			if (!open || !project) {
				setQuery("");
				setFiles([]);
				setActive(null);
				return;
			}
			if (cachedProject === project && cachedFiles.length > 0) {
				const lower = q.toLowerCase();
				const filtered = cachedFiles.filter((f) => f.toLowerCase().includes(lower));
				setFiles(filtered);
				setActive(filtered[0] ?? null);
			}
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				void loadFiles(project, q);
			}, 150);
		},
	);

	function choose(path: string): void {
		props.onSelect(path);
		props.onClose();
	}

	return (
		<Dialog open={props.open} onClose={props.onClose} title="Add from project" bare width="36rem">
			<Show when={props.open}>
				<Palette
					autofocus
					query={query()}
					onQuery={setQuery}
					placeholder="Search files by path or name…"
					items={files().map((file) => ({
						id: file,
						icon: <FileIcon size="sm" />,
						label: fileName(file),
						hint: fileDir(file) || undefined,
					}))}
					active={active()}
					onActive={setActive}
					onPick={choose}
					empty={loading() ? "Searching…" : "No files match your search."}
					footer={
						<>
							<Kbd>Esc</Kbd>
							<span>Close</span>
						</>
					}
				/>
			</Show>
		</Dialog>
	);
}
