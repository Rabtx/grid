import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import { WorkspaceMark } from "./workspace-mark";

/**
 * A workspace's sidebar in miniature, drawn from what is typed so far: the name, its mark and
 * its URL, over the navigation it will have. It shows what is being made or joined.
 */
export function WorkspacePreview(props: {
	name: string;
	slug: string;
	color?: string | null;
}): JSX.Element {
	const name = () => props.name.trim() || "Your workspace";

	return (
		<div class="flex h-full items-center justify-end py-10 pl-10">
			<div class="flex h-full max-h-80 w-full flex-col gap-4 rounded-l-xl border border-ink/8 border-r-0 bg-canvas p-4">
				<div class="flex items-center gap-2.5">
					<WorkspaceMark name={name()} color={props.color} class="size-8 text-ui" />
					<div class="min-w-0">
						<p class="truncate font-medium text-ink text-ui">{name()}</p>
						<p class="truncate text-ink/45 text-ui-xs">/{props.slug || "workspace"}</p>
					</div>
				</div>
				<div class="flex flex-col gap-2.5 pt-1" aria-hidden="true">
					<For each={["New chat", "Search", "Terminal"]}>
						{(label) => (
							<div class="flex items-center gap-2 text-ink/40 text-ui-sm">
								<span class="size-3 rounded-sm bg-ink/10" />
								{label}
							</div>
						)}
					</For>
				</div>
				<div class="flex flex-col gap-2.5" aria-hidden="true">
					<p class="text-ink/35 text-ui-xs">Projects</p>
					<For each={["w-24", "w-32", "w-20"]}>
						{(width) => (
							<div class="flex items-center gap-2">
								<span class="size-3 rounded-sm bg-ink/10" />
								<span class={`h-2 rounded-full bg-ink/8 ${width}`} />
							</div>
						)}
					</For>
				</div>
			</div>
		</div>
	);
}
