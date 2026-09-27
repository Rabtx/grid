import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
	bracketMatching,
	HighlightStyle,
	indentOnInput,
	syntaxHighlighting,
} from "@codemirror/language";
import {
	highlightSelectionMatches,
	openSearchPanel,
	search,
	searchKeymap,
} from "@codemirror/search";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
	placeholder as placeholderExtension,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { createEffect, onSettled, untrack, type Component } from "solid-js";

import type { CodeEditorProps } from "./code-editor";

/** Marks a transaction that puts text into the editor from outside, rather than a person typing. */
const replaced = Annotation.define<boolean>();

/**
 * CodeMirror 6, mounted into the file pane. This module exists on its own so the editor's bundle
 * is only fetched when a file is opened for editing; `./code-editor` is the kit piece screens use.
 */

/** The kit's syntax colours: the same signals the reader's Markdown highlighting uses. */
const HIGHLIGHT = HighlightStyle.define([
	{
		tag: [tags.comment, tags.lineComment, tags.blockComment],
		color: "var(--kit-fg-faint)",
		fontStyle: "italic",
	},
	{
		tag: [
			tags.keyword,
			tags.controlKeyword,
			tags.moduleKeyword,
			tags.operatorKeyword,
			tags.modifier,
		],
		color: "var(--color-link)",
	},
	{ tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--color-success)" },
	{ tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--color-warning)" },
	{
		tag: [tags.definition(tags.variableName), tags.function(tags.variableName)],
		color: "var(--color-accent)",
	},
	{
		tag: [tags.typeName, tags.className, tags.namespace, tags.tagName],
		color: "var(--color-accent)",
	},
	{ tag: [tags.propertyName, tags.attributeName], color: "var(--color-warning)" },
	{
		tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3],
		color: "var(--color-accent)",
		fontWeight: "medium",
	},
	{ tag: [tags.link, tags.url], color: "var(--color-link)", textDecoration: "underline" },
	{ tag: [tags.meta, tags.processingInstruction], color: "var(--kit-fg-subtle)" },
	{ tag: tags.invalid, color: "var(--color-danger)" },
]);

/**
 * The editor's own surface, drawn from kit tokens so it follows Appearance (the theme, the accent
 * and the interface scale) with no colours of its own.
 */
const THEME = EditorView.theme({
	"&": {
		height: "100%",
		backgroundColor: "transparent",
		color: "var(--kit-fg)",
		fontSize: "var(--kit-fs-caption)",
	},
	"&.cm-focused": { outline: "none" },
	".cm-scroller": {
		overflow: "auto",
		fontFamily: "var(--font-mono)",
		lineHeight: "1.6",
		overscrollBehavior: "contain",
	},
	".cm-content": { minHeight: "100%", padding: "0.5rem 0 2rem", caretColor: "var(--kit-fg)" },
	".cm-line": { padding: "0 0.75rem" },
	".cm-gutters": {
		backgroundColor: "transparent",
		color: "var(--kit-fg-faint)",
		border: "none",
		borderRight: "1px solid var(--kit-line)",
	},
	".cm-lineNumbers .cm-gutterElement": { minWidth: "2.5ch", padding: "0 0.5rem 0 0.75rem" },
	".cm-activeLine": { backgroundColor: "var(--kit-fill)" },
	".cm-activeLineGutter": { backgroundColor: "var(--kit-fill)", color: "var(--kit-fg-subtle)" },
	".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
		backgroundColor: "var(--selection)",
	},
	".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--kit-fg)", borderLeftWidth: "2px" },
	".cm-placeholder": { color: "var(--kit-fg-faint)" },
	".cm-panels": {
		backgroundColor: "var(--kit-surface-raised)",
		color: "var(--kit-fg)",
		borderTop: "1px solid var(--kit-line)",
	},
	".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": {
		fontFamily: "var(--kit-font)",
		fontSize: "var(--kit-fs-caption)",
	},
	".cm-panel.cm-search input": {
		backgroundColor: "var(--kit-surface)",
		color: "var(--kit-fg)",
		border: "1px solid var(--kit-line-strong)",
		borderRadius: "var(--radius-kit)",
		padding: "0.25rem 0.5rem",
	},
	".cm-panel.cm-search button": {
		backgroundColor: "var(--kit-surface)",
		color: "var(--kit-fg-muted)",
		border: "1px solid var(--kit-line-strong)",
		borderRadius: "var(--radius-kit)",
		padding: "0.25rem 0.5rem",
	},
	".cm-tooltip": {
		backgroundColor: "var(--kit-surface-raised)",
		color: "var(--kit-fg)",
		border: "1px solid var(--kit-line)",
		borderRadius: "var(--radius-kit)",
	},
});

/** The file's language, or nothing when Grid has no parser for it (a plain text editor is fine). */
async function languageFor(path: string) {
	const name = path.split("/").pop()?.toLowerCase() ?? "";
	const is = (...endings: string[]) => endings.some((ending) => name.endsWith(ending));
	if (is(".ts", ".tsx", ".mts", ".cts") || is(".js", ".jsx", ".mjs", ".cjs")) {
		const { javascript } = await import("@codemirror/lang-javascript");
		return javascript({ typescript: is(".ts", ".tsx", ".mts", ".cts"), jsx: is("x") });
	}
	if (is(".json")) return (await import("@codemirror/lang-json")).json();
	if (is(".md", ".mdx", ".markdown")) return (await import("@codemirror/lang-markdown")).markdown();
	if (is(".html", ".htm", ".vue", ".svelte")) return (await import("@codemirror/lang-html")).html();
	if (is(".css")) return (await import("@codemirror/lang-css")).css();
	if (is(".py")) return (await import("@codemirror/lang-python")).python();
	if (is(".rs")) return (await import("@codemirror/lang-rust")).rust();
	if (is(".yml", ".yaml")) return (await import("@codemirror/lang-yaml")).yaml();
	if (is(".sql")) return (await import("@codemirror/lang-sql")).sql();
	return null;
}

export const CodeEditorView: Component<CodeEditorProps> = (props) => {
	let host: HTMLDivElement | undefined;
	let view: EditorView | undefined;
	const language = new Compartment();
	const locked = new Compartment();
	// A ref, not signals: the keymap and the update listener read the newest callbacks, so
	// changing one does not rebuild the editor under the cursor. Read once, untracked: the effects
	// below keep it current.
	const calls = untrack(() => ({ change: props.onChange, save: props.onSave }));

	function applyLanguage(path: string): void {
		void languageFor(path).then((support) => {
			view?.dispatch({ effects: language.reconfigure(support ?? []) });
		});
	}

	onSettled(() => {
		if (!host) return;
		// The editor's first state: a snapshot of the props as they are now, read untracked
		// because a later change to them is handled by the effects below, not by rebuilding.
		const start = untrack(() => ({
			value: props.value,
			path: props.path,
			placeholder: props.placeholder ?? "",
			readOnly: props.readOnly ?? false,
		}));
		view = new EditorView({
			state: EditorState.create({
				doc: start.value,
				extensions: [
					lineNumbers(),
					highlightActiveLineGutter(),
					history(),
					drawSelection(),
					indentOnInput(),
					bracketMatching(),
					highlightActiveLine(),
					highlightSelectionMatches(),
					syntaxHighlighting(HIGHLIGHT),
					search({ top: true }),
					keymap.of([
						{
							key: "Mod-s",
							preventDefault: true,
							run: () => {
								calls.save();
								return true;
							},
						},
						{ key: "Mod-f", preventDefault: true, run: openSearchPanel },
						...searchKeymap,
						...defaultKeymap,
						...historyKeymap,
					]),
					EditorView.updateListener.of((update) => {
						// Text pushed in from outside is not an edit, so it is not reported back.
						if (update.docChanged && !update.transactions.some((t) => t.annotation(replaced)))
							calls.change(update.state.doc.toString());
					}),
					EditorView.lineWrapping,
					placeholderExtension(start.placeholder),
					THEME,
					language.of([]),
					locked.of(EditorState.readOnly.of(start.readOnly)),
				],
			}),
			parent: host,
		});
		applyLanguage(start.path);
		return () => view?.destroy();
	});

	// Typing does not change `revision`, so this only runs when the text is replaced from outside:
	// another file, a reload after a stale save, a save. The text and path are read untracked, so a
	// keystroke neither re-runs this nor compares the whole document.
	createEffect(
		() => [props.revision, untrack(() => props.value), untrack(() => props.path)] as const,
		([revision, value, path]) => {
			if (!revision || !view) return;
			if (view.state.doc.toString() !== value)
				view.dispatch({
					changes: { from: 0, to: view.state.doc.length, insert: value },
					annotations: replaced.of(true),
				});
			applyLanguage(path);
		},
	);
	createEffect(
		() => props.onChange,
		(onChange) => {
			calls.change = onChange;
		},
	);
	createEffect(
		() => props.onSave,
		(onSave) => {
			calls.save = onSave;
		},
	);
	createEffect(
		() => props.readOnly ?? false,
		(readOnly) =>
			view?.dispatch({ effects: locked.reconfigure(EditorState.readOnly.of(readOnly)) }),
	);

	return (
		<div
			ref={(el) => {
				host = el;
			}}
			class="h-full min-h-0"
		/>
	);
};
