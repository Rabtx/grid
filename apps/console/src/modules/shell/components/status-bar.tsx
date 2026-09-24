import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { useWorkspace } from "@/modules/projects";
import { FolderIcon, TerminalIcon } from "@/ui";

const ITEM =
	"focus-ring inline-flex h-5 min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-1.5 text-ink/50 hover:bg-ink/10 hover:text-ink pointer-coarse:h-8";

/**
 * The quiet line under every screen, 28px: the current project's folder on the left (choose one
 * when there is none), the terminal on the right.
 */
export function StatusBar(): JSX.Element {
	const workspace = useWorkspace();
	const folder = () => {
		const slug = workspace.currentSlug();
		return slug ? workspace.folders()[slug] : undefined;
	};

	return (
		<footer class="flex h-7 shrink-0 items-center gap-1.5 overflow-x-auto border-stroke border-t px-1.5 text-ui-caption [scrollbar-width:none] pointer-coarse:h-auto pointer-coarse:min-h-9 pointer-coarse:pb-[env(safe-area-inset-bottom)]">
			<Loading fallback={<span />}>
				<Show when={workspace.currentSlug()}>
					{(slug) => (
						<button
							type="button"
							class={ITEM}
							title={folder() ? `${folder()} — change` : "Choose this project's folder"}
							onClick={() => workspace.chooseFolderFor(slug())}
						>
							<FolderIcon class="size-3.5 shrink-0" />
							<span class="truncate">
								{folder()?.replace(/^\/home\/[^/]+/, "~") ?? "Choose folder"}
							</span>
						</button>
					)}
				</Show>
			</Loading>
			<a href="/terminal" class={`${ITEM} ml-auto`}>
				<TerminalIcon class="size-3.5 shrink-0" />
				Terminal
			</a>
		</footer>
	);
}
