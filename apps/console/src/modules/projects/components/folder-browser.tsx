import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { BackIcon, Button, ErrorNotice, FolderIcon, Input, Skeleton } from "@/ui";

import { type FolderListing, foldersService } from "../services/folders.service";

function shortPath(path: string, home: string): string {
	return path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/**
 * Browse folders on a machine — this one, or an environment through `scope` — from a phone as
 * well as the desktop, and pick one. Starts in the usual projects folder (or home), marks git
 * repositories, and takes a typed path to jump anywhere.
 */
export function FolderBrowser(props: {
	start?: string;
	/** The machine to browse (`placementsStore`/`scopeFor`); empty for this one. */
	scope?: string;
	actionLabel: string;
	onPick: (path: string) => void;
}): JSX.Element {
	const auth = useAuth();
	const [listing, setListing] = createSignal<FolderListing | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [typed, setTyped] = createSignal("");

	async function open(path?: string): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setError(null);
		try {
			const next = await foldersService.list(token, path, props.scope ?? "");
			setListing(next);
			setTyped(shortPath(next.path, next.home));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not open that folder");
		}
	}

	onSettled(() => {
		// The usual place for code first; home when there is no such folder.
		void open(props.start ?? "~/Projects").then(() => {
			if (!listing()) void open("~");
		});
	});

	return (
		<div class="flex min-h-0 flex-col gap-2">
			<form
				class="flex gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					void open(typed());
				}}
			>
				<Input
					value={typed()}
					onInput={(event) => setTyped(event.currentTarget.value)}
					aria-label="Folder path"
					autocapitalize="off"
					autocomplete="off"
					spellcheck={false}
					enterkeyhint="go"
					class="font-mono"
				/>
				<Button type="submit" size="lg">
					Go
				</Button>
			</form>
			<Show when={error()}>{(message) => <ErrorNotice message={message()} />}</Show>
			<Show
				when={listing()}
				fallback={
					<div class="flex flex-col gap-1.5">
						<Skeleton class="h-10" />
						<Skeleton class="h-10" />
						<Skeleton class="h-10" />
					</div>
				}
			>
				{(current) => (
					<>
						<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-ink/10">
							<Show when={current().parent}>
								{(parent) => (
									<button
										type="button"
										onClick={() => void open(parent())}
										class="focus-ring flex w-full items-center gap-2 border-ink/8 border-b px-3 py-2.5 text-left text-ink/60 text-ui-sm hover:bg-ink/5 pointer-coarse:py-3"
									>
										<BackIcon class="size-4 shrink-0" />
										Up to {shortPath(parent(), current().home)}
									</button>
								)}
							</Show>
							<Show
								when={current().folders.length > 0}
								fallback={
									<p class="px-3 py-6 text-center text-ink/45 text-ui-sm">No folders in here.</p>
								}
							>
								<ul>
									<For each={current().folders}>
										{(folder) => (
											<li>
												<button
													type="button"
													onClick={() => void open(folder.path)}
													class="focus-ring flex w-full items-center gap-2 px-3 py-2 text-left text-ink/85 text-ui-sm hover:bg-ink/5 pointer-coarse:py-3"
												>
													<FolderIcon class="size-4 shrink-0 text-ink/45" />
													<span class="min-w-0 flex-1 truncate">{folder.name}</span>
													<Show when={folder.git}>
														<span class="shrink-0 rounded-sm bg-ink/8 px-1.5 py-0.5 text-ink/55 text-ui-caption">
															git
														</span>
													</Show>
												</button>
											</li>
										)}
									</For>
								</ul>
							</Show>
						</div>
						<Button
							variant="primary"
							size="lg"
							class="w-full"
							onClick={() => props.onPick(current().path)}
						>
							{props.actionLabel} {shortPath(current().path, current().home)}
						</Button>
					</>
				)}
			</Show>
		</div>
	);
}
