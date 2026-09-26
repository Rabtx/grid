import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Show } from "solid-js";

import { diffRows, type DiffRow } from "../lib/diff";
import type { FileDiff } from "../types/chat.types";

// Long diffs open at this many rows; the rest is one tap away.
const FIRST_ROWS = 80;

const ROW_TONE: Record<Exclude<DiffRow["kind"], "hunk">, string> = {
	add: "bg-success/10",
	del: "bg-danger/10",
	context: "",
};
const MARK: Record<Exclude<DiffRow["kind"], "hunk">, string> = { add: "+", del: "−", context: "" };

function shortPath(path: string): string {
	return path.replace(/^\/home\/[^/]+/, "~");
}

/** A file an agent changed: its path and counts, then its hunks, highlighted, additions in green. */
export function DiffView(props: { diff: FileDiff }): JSX.Element {
	const rows = createMemo(() => diffRows(props.diff));
	const [all, setAll] = createSignal(false);
	const shown = () => (all() ? rows() : rows().slice(0, FIRST_ROWS));

	return (
		<figure class="min-w-0 overflow-hidden rounded-md border border-ink/10">
			<figcaption class="flex min-w-0 items-center gap-2 border-ink/10 border-b bg-ink/4 px-2.5 py-1.5 text-ui-xs">
				<span class="min-w-0 flex-1 truncate font-mono text-ink/70" title={props.diff.path}>
					{shortPath(props.diff.path)}
				</span>
				<span class="shrink-0 font-mono text-success tabular-nums">+{props.diff.added}</span>
				<span class="shrink-0 font-mono text-danger tabular-nums">−{props.diff.removed}</span>
			</figcaption>
			<Show
				when={rows().length > 0}
				fallback={<p class="px-2.5 py-2 text-ink/45 text-ui-xs">Too large to show here.</p>}
			>
				<div class="overflow-x-auto">
					<table class="w-full border-collapse font-mono text-ui-xs leading-5">
						<tbody>
							<For each={shown()}>
								{(row) => (
									<Show
										when={row.kind !== "hunk" && row}
										fallback={
											<tr class="bg-ink/4 text-ink/40">
												<td colspan={4} class="px-2.5 py-0.5">
													{props.diff.snippet ? "···" : (row as { text: string }).text}
												</td>
											</tr>
										}
									>
										{(line) => {
											const code = line() as Exclude<DiffRow, { kind: "hunk" }>;
											return (
												<tr data-kind={code.kind} class={ROW_TONE[code.kind]}>
													<Show when={!props.diff.snippet}>
														<td class="hidden w-px select-none whitespace-nowrap px-1.5 text-right text-ink/30 sm:table-cell">
															{code.old ?? ""}
														</td>
														<td class="w-px select-none whitespace-nowrap px-1.5 text-right text-ink/30">
															{code.new ?? code.old ?? ""}
														</td>
													</Show>
													<td
														class={`w-px select-none pl-1.5 ${code.kind === "add" ? "text-success" : "text-danger"}`}
													>
														{MARK[code.kind]}
													</td>
													{/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- a table cell of code, not a control; its text is set as highlighted HTML */}
													<td
														class="whitespace-pre pr-3 pl-1 text-ink/85"
														innerHTML={code.html || " "}
													/>
												</tr>
											);
										}}
									</Show>
								)}
							</For>
						</tbody>
					</table>
				</div>
				<Show when={!all() && rows().length > FIRST_ROWS}>
					<button
						type="button"
						class="focus-ring w-full border-ink/10 border-t px-2.5 py-1.5 text-left text-link text-ui-xs hover:bg-ink/4 pointer-coarse:min-h-10"
						onClick={() => setAll(true)}
					>
						Show all {rows().length} lines
					</button>
				</Show>
			</Show>
		</figure>
	);
}
