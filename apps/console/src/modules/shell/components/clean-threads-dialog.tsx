import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { Button, Checkbox, Dialog, notify, Text } from "@/kit";
import { now } from "@/lib/clock";
import { useAuth } from "@/modules/auth";
import { threadsStore } from "@/modules/chat/stores/threads";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function ago(iso: string): string {
	const minutes = Math.round((now() - Date.parse(iso)) / 60_000);
	if (minutes < 60) return `${Math.max(1, minutes)}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

/**
 * Deleting many of a project's threads at once: each with a box to tick, the oldest first, with
 * shortcuts for all of them and for those older than a week. A thread still at work cannot be
 * picked. Each goes the way one deleted alone does (its worktree only if nothing is left in it).
 */
export function CleanThreadsDialog(props: {
	project: string | null;
	onClose: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [picked, setPicked] = createSignal<ReadonlySet<string>>(new Set<string>());
	const [busy, setBusy] = createSignal(false);
	const threads = createMemo(() =>
		[...threadsStore.threads(props.project ?? "")].sort((a, b) =>
			a.updatedAt.localeCompare(b.updatedAt),
		),
	);
	const working = (id: string) => threadsStore.isRunning(id);
	const pickable = () => threads().filter((thread) => !working(thread.id));
	createEffect(
		() => props.project,
		() => {
			setPicked(new Set<string>());
		},
	);

	const toggle = (id: string, on: boolean) => {
		const next = new Set(picked());
		if (on) next.add(id);
		else next.delete(id);
		setPicked(next);
	};

	async function remove(): Promise<void> {
		const token = auth.token();
		if (!token || picked().size === 0) return;
		setBusy(true);
		const chosen = threads().filter((thread) => picked().has(thread.id));
		let failed = 0;
		for (const thread of chosen) await threadsStore.remove(token, thread).catch(() => failed++);
		setBusy(false);
		notify({
			title: failed
				? `Deleted ${chosen.length - failed}; ${failed} could not be deleted`
				: `Deleted ${chosen.length} thread${chosen.length === 1 ? "" : "s"}`,
			...(failed ? { tone: "danger" as const } : {}),
		});
		setPicked(new Set<string>());
		props.onClose();
	}

	return (
		<Dialog
			open={props.project !== null}
			onClose={props.onClose}
			title="Delete threads"
			description={props.project ?? undefined}
			width="30rem"
			footer={
				<>
					<Button onClick={props.onClose}>Cancel</Button>
					<Button
						variant="danger"
						disabled={busy() || picked().size === 0}
						onClick={() => void remove()}
					>
						{busy()
							? "Deleting…"
							: picked().size
								? `Delete ${picked().size} thread${picked().size === 1 ? "" : "s"}`
								: "Delete threads"}
					</Button>
				</>
			}
		>
			<div class="flex flex-col gap-3">
				<div class="flex items-center gap-2">
					<Button
						size="sm"
						variant="ghost"
						onClick={() =>
							setPicked(
								picked().size === pickable().length
									? new Set<string>()
									: new Set(pickable().map((thread) => thread.id)),
							)
						}
					>
						{picked().size === pickable().length && pickable().length > 0 ? "None" : "All"}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() =>
							setPicked(
								new Set(
									pickable()
										.filter((thread) => now() - Date.parse(thread.updatedAt) > WEEK_MS)
										.map((thread) => thread.id),
								),
							)
						}
					>
						Older than a week
					</Button>
				</div>
				<Show
					when={threads().length > 0}
					fallback={
						<Text tone="subtle" class="py-4">
							No threads in this project.
						</Text>
					}
				>
					<div class="flex max-h-96 flex-col divide-y divide-line overflow-y-auto">
						<For each={threads()}>
							{(thread) => (
								<label class="flex min-h-11 cursor-pointer items-center gap-3 py-2">
									<Checkbox
										label={`Delete ${thread.title}`}
										checked={picked().has(thread.id)}
										onChange={(on) => toggle(thread.id, on)}
									/>
									<Text truncate class="min-w-0 flex-1">
										{thread.title}
									</Text>
									<Text size="caption" tone="subtle" class="shrink-0">
										{working(thread.id) ? "Working" : ago(thread.updatedAt)}
									</Text>
								</label>
							)}
						</For>
					</div>
				</Show>
			</div>
		</Dialog>
	);
}
