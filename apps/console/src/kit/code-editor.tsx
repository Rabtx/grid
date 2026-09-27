import type { JSX } from "@solidjs/web";
import { lazy, Loading } from "solid-js";

import { Skeleton } from "./surface";

/**
 * A text editor for a file: line numbers, undo and redo, Ctrl/⌘+F to search, Ctrl/⌘+S to save,
 * and syntax colouring for the file's language. Its colours come from the same tokens as the rest
 * of the kit.
 *
 * CodeMirror and its language packages are a few hundred kilobytes, so the editor that draws it
 * is a module of its own (`./code-editor-view`) and is fetched the first time an editor is shown —
 * a file being read never pays for it.
 */
const CodeEditorView = lazy(() => import("./code-editor-view"), { export: "CodeEditorView" });

/** The props `CodeEditor` passes down to the lazily loaded editor. */
export type CodeEditorProps = {
	/** The text to show. Replaced from outside only when `revision` changes. */
	value: string;
	/** The file's name, which picks the language. */
	path: string;
	/**
	 * Bumped to replace the text from outside: another file, a reload, an overwrite. Typing does
	 * not change it, so the cursor is never thrown back to the start.
	 */
	revision: number;
	readOnly?: boolean;
	placeholder?: string;
	onChange: (text: string) => void;
	onSave: () => void;
};

export function CodeEditor(props: CodeEditorProps & { class?: string }): JSX.Element {
	return (
		<div class={`min-h-0 min-w-0 flex-1 overflow-hidden ${props.class ?? ""}`}>
			<Loading fallback={<EditorSkeleton />}>
				<CodeEditorView
					value={props.value}
					path={props.path}
					revision={props.revision}
					readOnly={props.readOnly ?? false}
					placeholder={props.placeholder ?? ""}
					onChange={props.onChange}
					onSave={props.onSave}
				/>
			</Loading>
		</div>
	);
}

/** What the editor shows while its bundle is on the way. */
function EditorSkeleton(): JSX.Element {
	return (
		<div class="flex min-h-0 flex-1 flex-col gap-2 p-4" aria-hidden="true">
			<Skeleton class="h-4 w-2/3" />
			<Skeleton class="h-4 w-1/2" />
			<Skeleton class="h-4 w-3/4" />
		</div>
	);
}
