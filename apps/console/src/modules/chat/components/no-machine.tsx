import type { JSX } from "@solidjs/web";

import { CopyField, EmptyState, LaptopIcon, TextLink, WaitingLine } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";

/** The command that starts this machine's runner, from Grid's own folder. */
export const RUNNER_COMMAND = "bun --cwd=apps/runner run dev";

/**
 * Threads with no machine to run on (Figma 27 · No machine): agents work on your own hardware,
 * so a new thread waits for this machine's runner, which Grid finds on its own once it answers.
 */
export function NoMachine(): JSX.Element {
	return (
		<div class="grid min-h-0 flex-1 place-items-center p-4">
			<EmptyState
				icon={<LaptopIcon size="md" />}
				title="Connect a machine to start"
				description="Agents run on your own hardware. Start the runner from Grid's folder and this page finds it in a few seconds."
			>
				<div class="w-full max-w-sm">
					<CopyField value={RUNNER_COMMAND} label="Command that starts the runner" mono />
				</div>
				<WaitingLine>Waiting for a runner…</WaitingLine>
				<TextLink href={workspaceHref("/settings/machines")}>Connect another machine</TextLink>
			</EmptyState>
		</div>
	);
}
