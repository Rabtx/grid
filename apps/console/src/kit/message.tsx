import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { FileIcon } from "./icons";

/** What you asked: a soft bubble on the right, as wide as the text needs. */
export function UserMessage(props: {
	children: JSX.Element;
	attachments?: readonly string[];
}): JSX.Element {
	return (
		<div class="flex flex-col items-end gap-1.5">
			<Show when={props.attachments?.length}>
				<div class="flex flex-wrap justify-end gap-1.5">
					<For each={props.attachments}>{(name) => <Attachment name={name} />}</For>
				</div>
			</Show>
			<div class="max-w-[85%] rounded-kit-xl rounded-br-kit-sm bg-fill-strong px-3.5 py-2.5 text-body-lg text-fg">
				{props.children}
			</div>
		</div>
	);
}

/** What the agent said: plain prose on the canvas, no bubble, then its actions. */
export function AgentMessage(props: { children: JSX.Element; actions?: JSX.Element }): JSX.Element {
	return (
		<div class="flex flex-col gap-2">
			<div class="max-w-none text-body-lg text-fg leading-relaxed [&_code]:rounded-kit-sm [&_code]:bg-fill-strong [&_code]:px-1 [&_code]:font-mono [&_code]:text-body [&_p+p]:mt-3">
				{props.children}
			</div>
			<Show when={props.actions}>
				<div class="flex items-center gap-0.5 text-fg-subtle">{props.actions}</div>
			</Show>
		</div>
	);
}

/** A file attached to a message. */
export function Attachment(props: { name: string; onRemove?: () => void }): JSX.Element {
	return (
		<span class="inline-flex h-7 max-w-56 items-center gap-1.5 rounded-kit bg-surface px-2 text-body text-fg-muted ring-line-strong">
			<FileIcon class="size-3.5 shrink-0 text-fg-subtle" />
			<span class="truncate">{props.name}</span>
		</span>
	);
}

export type DiffLine = { kind: "add" | "remove" | "context"; text: string };

/** A change to one file: its path and counts, then the lines, green added and red removed. */
export function DiffCard(props: { path: string; lines: readonly DiffLine[] }): JSX.Element {
	const added = () => props.lines.filter((line) => line.kind === "add").length;
	const removed = () => props.lines.filter((line) => line.kind === "remove").length;
	return (
		<div class="overflow-hidden rounded-kit-lg ring-line">
			<div class="flex h-9 items-center gap-2 border-line border-b bg-fill px-3 text-caption">
				<FileIcon class="size-3.5 text-fg-subtle" />
				<span class="min-w-0 flex-1 truncate font-mono text-fg-muted">{props.path}</span>
				<span class="text-success tabular-nums">+{added()}</span>
				<span class="text-danger tabular-nums">−{removed()}</span>
			</div>
			<pre class="overflow-x-auto py-1.5 font-mono text-caption leading-5">
				<For each={props.lines}>
					{(line) => (
						<div
							class={`flex px-3 ${line.kind === "add" ? "bg-success/8 text-fg" : line.kind === "remove" ? "bg-danger/8 text-fg-muted" : "text-fg-subtle"}`}
						>
							<span class="w-4 shrink-0 select-none opacity-60">
								{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
							</span>
							{line.text}
						</div>
					)}
				</For>
			</pre>
		</div>
	);
}
