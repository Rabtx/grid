import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";

import {
	Alert,
	Button,
	ConfirmDialog,
	RestoreIcon,
	RocketIcon,
	SettingsGroup,
	SettingsRow,
	Spinner,
} from "@/kit";
import { useAuth } from "@/modules/auth";

import { machineService, type UpdateStatus } from "../services/machine.service";

/** How often a running update is read; it takes a minute or two and ends in a restart. */
const POLL_MS = 3_000;

/** What a running update is doing, for the person waiting on it. */
const STEP: Record<string, string> = {
	starting: "Starting",
	fetching: "Getting the latest version",
	"checking out": "Switching to it",
	installing: "Installing packages",
	building: "Building",
	restarting: "Restarting Grid",
};

/**
 * Grid's own version on this machine, and updating it: the latest main, built, then the services
 * restarted (Settings → Machines). Only roles that manage machines can update.
 */
export function GridVersion(props: { admin: boolean }): JSX.Element {
	const auth = useAuth();
	const [status, setStatus] = createSignal<UpdateStatus | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [checking, setChecking] = createSignal(false);
	const [confirming, setConfirming] = createSignal(false);
	// While Grid restarts, the runner does not answer for a moment: that is the update working.
	const [restarting, setRestarting] = createSignal(false);

	async function read(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			setStatus(await machineService.updateStatus(token));
			setRestarting(false);
			setError(null);
		} catch (cause) {
			if (status()?.last?.state === "running") setRestarting(true);
			else setError(cause instanceof Error ? cause.message : "Could not read Grid's version");
		}
	}

	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void untrack(read);
		},
	);

	const running = () => status()?.last?.state === "running" || restarting();
	createEffect(running, (busy) => {
		if (!busy) return;
		const timer = setInterval(() => void read(), POLL_MS);
		onCleanup(() => clearInterval(timer));
	});

	async function check(): Promise<void> {
		const token = auth.token();
		if (!token || checking()) return;
		setChecking(true);
		try {
			setStatus(await machineService.checkForUpdate(token));
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not check for updates");
		} finally {
			setChecking(false);
		}
	}

	async function update(): Promise<void> {
		const token = auth.token();
		setConfirming(false);
		if (!token) return;
		try {
			setStatus(await machineService.updateGrid(token));
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not start the update");
		}
	}

	const current = () => status()?.current;
	const behind = () => status()?.behind;
	const last = () => status()?.last;
	const progress = () =>
		restarting() ? "Restarting Grid" : (STEP[last()?.step ?? ""] ?? last()?.step ?? "Working");

	return (
		<SettingsGroup title="Grid version">
			<Show when={status()} fallback={<Spinner label="Reading Grid's version" />}>
				<SettingsRow
					inline
					leading={<RocketIcon />}
					label={current() ? `Running ${current()?.commit}` : "Version unknown"}
					description={
						status()?.available
							? behind() === null || behind() === undefined
								? current()?.subject
								: behind() === 0
									? "Up to date with main"
									: `${behind()} new change${behind() === 1 ? "" : "s"} on main`
							: (status()?.reason ?? undefined)
					}
				>
					<Show when={props.admin && status()?.available && !running()}>
						<Button size="sm" disabled={checking()} onClick={() => void check()}>
							{checking() ? "Checking…" : "Check for updates"}
						</Button>
					</Show>
				</SettingsRow>
				<Show when={props.admin && status()?.available}>
					<SettingsRow
						inline
						leading={<RestoreIcon />}
						label={running() ? progress() : "Update and restart"}
						description={
							running()
								? "Grid stays usable while it builds, then is away for a few seconds"
								: "Gets the latest main, builds it and restarts Grid on this machine"
						}
					>
						<Show when={!running()} fallback={<Spinner label={progress()} />}>
							<Button size="sm" variant="primary" onClick={() => setConfirming(true)}>
								Update
							</Button>
						</Show>
					</SettingsRow>
				</Show>
				<Show when={!running() && last()?.state === "failed"}>
					<div class="p-4">
						<Alert tone="danger" title="The last update did not finish">
							{last()?.message}
						</Alert>
					</div>
				</Show>
				<Show when={!running() && last()?.state === "done" && last()?.to === current()?.commit}>
					<div class="p-4">
						<Alert tone="success" title={`Updated to ${last()?.to}`} />
					</div>
				</Show>
			</Show>
			<Show when={error()}>
				{(message) => (
					<div class="p-4">
						<Alert tone="danger" title={message()} />
					</div>
				)}
			</Show>
			<ConfirmDialog
				open={confirming()}
				onClose={() => setConfirming(false)}
				onConfirm={() => void update()}
				title="Update Grid?"
				description="Grid gets the latest version, builds it and restarts on this machine. It stays usable while it builds; open threads reconnect after the restart."
				confirm="Update and restart"
			/>
		</SettingsGroup>
	);
}
