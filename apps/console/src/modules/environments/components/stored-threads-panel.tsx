import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import { Button, ConfirmDialog, LaptopIcon, notify, SettingsGroup, SettingsRow } from "@/kit";
import { useAuth } from "@/modules/auth";
import { relativeTime } from "@/modules/projects/lib/relative-time";

import { machineService, type StoredMachine } from "../services/machine.service";

/** "3 threads · 2d": what a machine left, and when it last sent any. */
function summary(machine: StoredMachine): string {
	const threads = `${machine.threads} thread${machine.threads === 1 ? "" : "s"}`;
	const when = relativeTime(machine.lastSyncedAt);
	return when ? `${threads} · ${when}` : threads;
}

/**
 * Settings → Machines → Restore threads: machines whose threads Grid's database kept (a laptop
 * that died, a deleted VPS), each restored here in one step, with its history and files. Shown to
 * people who manage machines, and only when there is something to restore; a runner that keeps no
 * threads in Grid's database shows nothing.
 */
export function StoredThreadsPanel(props: { admin: boolean }): JSX.Element {
	const auth = useAuth();
	const [machines, setMachines] = createSignal<StoredMachine[]>([]);
	// The machine being restored, kept while the dialog closes so its title does not change under it.
	const [confirming, setConfirming] = createSignal<StoredMachine | null>(null);
	const [open, setOpen] = createSignal(false);
	const ask = (machine: StoredMachine) => {
		setConfirming(machine);
		setOpen(true);
	};
	const [pending, setPending] = createSignal(false);

	async function load(token: string): Promise<void> {
		try {
			setMachines(await machineService.storedMachines(token));
		} catch {
			// This runner keeps no threads in Grid's database, or cannot reach it: nothing to offer.
			setMachines([]);
		}
	}

	createEffect(
		() => [auth.token(), props.admin] as const,
		([token, admin]) => {
			if (token && admin) void load(token);
		},
	);

	async function restore(): Promise<void> {
		const token = auth.token();
		const machine = confirming();
		if (!token || !machine) return;
		setPending(true);
		try {
			const result = await machineService.restoreMachine(token, machine.id);
			notify({
				title: `Restored ${result.imported} thread${result.imported === 1 ? "" : "s"}`,
				description: `From ${machine.name ?? "the other machine"}. They are on this machine now.`,
				tone: "success",
			});
			setOpen(false);
			await load(token);
		} catch (cause) {
			setOpen(false);
			notify({
				title: cause instanceof Error ? cause.message : "Could not restore them",
				tone: "danger",
			});
		} finally {
			setPending(false);
		}
	}

	return (
		<Show when={props.admin && machines().length > 0}>
			<SettingsGroup
				title="Restore threads"
				description="Threads Grid kept from machines that are gone, with their history and files"
			>
				<For each={machines()}>
					{(machine) => (
						<SettingsRow
							inline
							leading={<LaptopIcon />}
							label={machine.name ?? "Unnamed machine"}
							description={summary(machine)}
						>
							<Button size="sm" variant="ghost" onClick={() => ask(machine)}>
								Restore
							</Button>
						</SettingsRow>
					)}
				</For>
			</SettingsGroup>
			<ConfirmDialog
				open={open()}
				title={`Restore threads from ${confirming()?.name ?? "this machine"}?`}
				description="They come to this machine with their history and files, and stay here from now on. Their agents start fresh, told what was said before."
				confirm="Restore"
				pending={pending()}
				stayOpen
				onConfirm={() => void restore()}
				onClose={() => setOpen(false)}
			/>
		</Show>
	);
}
