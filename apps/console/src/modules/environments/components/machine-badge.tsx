import type { JSX } from "@solidjs/web";
import { createEffect, Show, untrack } from "solid-js";

import { Badge } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { runnerUp } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";

import { machineName } from "../stores/machine-name";

/**
 * This machine in a word, from the floating canvas's lower right corner (the Figma
 * "rabtx-studio · online"): its name and whether its runner answers, opening Settings → Machines.
 */
export function MachineBadge(): JSX.Element {
	const auth = useAuth();
	const hostname = machineName.name;

	// The name once per sign-in, or once the runner answers; whether it answers is live.
	createEffect(
		() => [auth.token(), runnerUp()] as const,
		([token, up]) => {
			if (token && up) void machineName.load(token);
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
					{(name) => <>{name()}</>}
				</Show>
				{runnerUp() ? " · online" : " · offline"}
			</Badge>
		</a>
	);
}
