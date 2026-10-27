import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show, untrack } from "solid-js";

import {
	Badge,
	Button,
	CopyLine,
	Input,
	notify,
	SettingsGroup,
	SettingsRow,
	ShieldIcon,
} from "@/kit";
import { useAuth } from "@/modules/auth";

import { type MachinePrefs, machineService, type SandboxStatus } from "../services/machine.service";

/**
 * Settings → Machines → Sandbox: whether this machine can run a thread's agent in a throwaway
 * Docker container (a project's menu turns it on for its new threads), and the image it uses.
 * Grid's own image is built here with `bun run sandbox:build`.
 */
export function SandboxPanel(props: {
	admin: boolean;
	prefs: MachinePrefs;
	onChange: (patch: Partial<MachinePrefs>) => Promise<void>;
}): JSX.Element {
	const auth = useAuth();
	const [status, setStatus] = createSignal<SandboxStatus | null>(null);
	// What the field starts with; it is the person's to edit from there.
	const [image, setImage] = createSignal(untrack(() => props.prefs.sandboxImage ?? ""));
	const [checking, setChecking] = createSignal(false);

	async function check(fresh: boolean): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setChecking(true);
		try {
			setStatus(await machineService.sandbox(token, fresh));
		} catch (cause) {
			notify({
				title: "Could not ask about Docker",
				description: cause instanceof Error ? cause.message : "Try again",
			});
		} finally {
			setChecking(false);
		}
	}
	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void check(false);
		},
	);

	async function save(): Promise<void> {
		await props.onChange({ sandboxImage: image().trim() });
		await check(true);
	}

	const state = () => {
		const current = status();
		if (!current) return null;
		if (!current.available) return { tone: "warning" as const, label: "Docker not running" };
		if (current.imageReady === false) return { tone: "warning" as const, label: "Image not built" };
		return { tone: "success" as const, label: "Ready" };
	};

	return (
		<SettingsGroup
			title="Sandbox"
			description="Threads of a project set to run in a sandbox (its menu) run their agent in a throwaway container that sees only the thread's folder and the agent's sign-in."
		>
			<SettingsRow
				leading={<ShieldIcon />}
				label="Docker"
				description={status()?.reason ?? (status() ? `Image ${status()?.image}` : "Asking…")}
			>
				<Show when={state()}>{(shown) => <Badge tone={shown().tone}>{shown().label}</Badge>}</Show>
				<Button size="sm" variant="ghost" disabled={checking()} onClick={() => void check(true)}>
					Check again
				</Button>
			</SettingsRow>
			<Show
				when={status()?.available && status()?.imageReady === false && !props.prefs.sandboxImage}
			>
				<div class="flex flex-col gap-1.5 px-4 py-3 md:px-5">
					<CopyLine label="Build the sandbox image" value="bun run sandbox:build" />
				</div>
			</Show>
			<SettingsRow
				label="Image"
				description="Empty for Grid's own (grid-sandbox). Any image with the agents' commands on its PATH works."
			>
				<div class="flex min-w-0 items-center gap-2">
					<Input
						aria-label="Sandbox image"
						placeholder="grid-sandbox"
						value={image()}
						disabled={!props.admin}
						onInput={(event) => setImage(event.currentTarget.value)}
					/>
					<Button
						size="sm"
						disabled={!props.admin || image().trim() === (props.prefs.sandboxImage ?? "")}
						onClick={() => void save()}
					>
						Save
					</Button>
				</div>
			</SettingsRow>
		</SettingsGroup>
	);
}
