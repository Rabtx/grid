import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { Badge } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { runnerUp } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";

import { machineService } from "../services/machine.service";

/**
 * This machine in a word, from the floating canvas's lower right corner (the Figma
 * "rabtx-studio · online"): its name and whether its runner answers, opening Settings → Machines.
 */
export function MachineBadge(): JSX.Element {
	const auth = useAuth();
	const [hostname, setHostname] = createSignal<string | null>(null);

	// The name once per sign-in and each time the runner comes back; whether it answers is live.
	createEffect(
		() => [auth.token(), runnerUp()] as const,
		([token, up]) => {
			if (!token || !up || hostname()) return;
			machineService.status(token).then(
				(status) => setHostname(status.info.hostname),
				() => setHostname(null),
			);
		},
	);

	return (
		<a
			href={workspaceHref("/settings/machines")}
			aria-label={runnerUp() ? "This machine is online" : "This machine is offline"}
			class="focus-ring inline-flex"
		>
			<Badge tone={runnerUp() ? "success" : "danger"} dot>
				<Show when={hostname()} fallback="This machine">
					{(name) => name()}
				</Show>
				{runnerUp() ? " · online" : " · offline"}
			</Badge>
		</a>
	);
}
