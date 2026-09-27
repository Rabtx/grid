import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import {
	Alert,
	BackIcon,
	Badge,
	Button,
	FolderIcon,
	Input,
	ListCard,
	ListRow,
	Row,
	Skeleton,
	Stack,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";

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
		<Stack gap={2} class="min-h-0">
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void open(typed());
				}}
			>
				<Row gap={2}>
					<Input
						value={typed()}
						onInput={(event) => setTyped(event.currentTarget.value)}
						aria-label="Folder path"
						autocapitalize="off"
						autocomplete="off"
						spellcheck={false}
						enterkeyhint="go"
						class="min-w-0 flex-1 font-mono"
					/>
					<Button type="submit">Go</Button>
				</Row>
			</form>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<Show
				when={listing()}
				fallback={
					<Stack gap={1.5}>
						<Skeleton class="h-10" />
						<Skeleton class="h-10" />
						<Skeleton class="h-10" />
					</Stack>
				}
			>
				{(current) => (
					<>
						<ListCard class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
							<div class="flex flex-col gap-px p-1">
								<Show when={current().parent}>
									{(parent) => (
										<ListRow
											icon={<BackIcon size="sm" />}
											title={`Up to ${shortPath(parent(), current().home)}`}
											onClick={() => void open(parent())}
										/>
									)}
								</Show>
								<Show
									when={current().folders.length > 0}
									fallback={
										<Text tone="faint" class="px-3 py-6 text-center">
											No folders in here.
										</Text>
									}
								>
									<For each={current().folders}>
										{(folder) => (
											<ListRow
												icon={<FolderIcon size="sm" />}
												title={folder.name}
												trailing={folder.git ? <Badge>git</Badge> : undefined}
												onClick={() => void open(folder.path)}
											/>
										)}
									</For>
								</Show>
							</div>
						</ListCard>
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
		</Stack>
	);
}
