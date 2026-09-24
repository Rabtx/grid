import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { SegmentedControl, Textarea } from "@/ui";

type Mode = "write" | "preview";

type Renderer = {
	renderMarkdown: (text: string) => string;
	copyCodeFrom: (event: MouseEvent) => void;
};

// The renderer lives with chat and brings a Markdown parser and highlighter, so it loads on the
// first preview.
let renderer: Promise<Renderer> | null = null;
function loadRenderer(): Promise<Renderer> {
	renderer ??= import("@/modules/chat/lib/markdown");
	return renderer;
}

/**
 * A Markdown text box with a preview, for task descriptions. Write is a plain textarea;
 * Preview renders it the way it will read. Cmd/Ctrl+Enter is passed on for "submit".
 */
export function MarkdownField(props: {
	value: string;
	onInput: (value: string) => void;
	onSubmit?: () => void;
	onBlur?: () => void;
	label: string;
	placeholder?: string;
	rows?: number;
}): JSX.Element {
	const [mode, setMode] = createSignal<Mode>("write");
	const [html, setHtml] = createSignal("");
	let copy: ((event: MouseEvent) => void) | undefined;

	function show(next: Mode): void {
		setMode(next);
		if (next === "preview")
			void loadRenderer().then((markdown) => {
				copy = markdown.copyCodeFrom;
				setHtml(markdown.renderMarkdown(props.value));
			});
	}

	return (
		<div class="flex flex-col gap-2">
			<div class="flex items-center justify-between gap-2">
				<span class="font-medium text-ink/70 text-ui-sm">{props.label}</span>
				<SegmentedControl
					label={`${props.label} view`}
					options={[
						{ value: "write", label: "Write" },
						{ value: "preview", label: "Preview" },
					]}
					value={mode()}
					onChange={show}
				/>
			</div>
			<Show
				when={mode() === "write"}
				fallback={
					<Show
						when={props.value.trim()}
						fallback={<p class="min-h-24 px-1 py-2 text-ink/40 text-ui-sm">Nothing to preview.</p>}
					>
						{/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegates clicks from the code cards' own buttons */}
						<div
							class="chat-prose min-h-24 overflow-x-auto rounded-md border border-ink/10 px-3 py-2 text-ink text-ui"
							innerHTML={html()}
							onClick={(event) => copy?.(event)}
						/>
					</Show>
				}
			>
				<Textarea
					value={props.value}
					aria-label={props.label}
					placeholder={props.placeholder ?? "Add details in Markdown…"}
					rows={props.rows ?? 5}
					onInput={(event) => props.onInput(event.currentTarget.value)}
					onBlur={() => props.onBlur?.()}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							props.onSubmit?.();
						}
					}}
				/>
			</Show>
		</div>
	);
}
