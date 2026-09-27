import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { Prose, Row, Segmented, Text, Textarea } from "@/kit";

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
			<Row gap={2} justify="between">
				<Text as="span" tone="strong" weight="medium">
					{props.label}
				</Text>
				<Segmented<Mode>
					label={`${props.label} view`}
					options={[
						{ value: "write", label: "Write" },
						{ value: "preview", label: "Preview" },
					]}
					value={mode()}
					onChange={show}
				/>
			</Row>
			<Show
				when={mode() === "write"}
				fallback={
					<Show
						when={props.value.trim()}
						fallback={
							<Text tone="faint" class="min-h-24 px-1 py-2">
								Nothing to preview.
							</Text>
						}
					>
						<Prose framed html={html()} onClick={(event) => copy?.(event)} />
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
