import type { TerminalState } from "@/kit";
import { relativeTime } from "@/modules/projects/lib/relative-time";

import type { TerminalInfo } from "../types/terminal.types";

/**
 * A terminal as the panel, the tabs and the phone's cards show it (Figma 15 · Terminals): its dot
 * and the one line saying what it is doing. Only what the runner reports: a port it serves, the
 * command in the foreground, the folder it waits in, or how it ended.
 */

/** Ended badly, serving a port, running a command, or waiting at its prompt. */
export function stateOf(terminal: TerminalInfo): TerminalState {
	if (terminal.exitCode !== null) return terminal.exitCode === 0 ? "idle" : "failed";
	if (terminal.status?.ports.length) return "serving";
	if (terminal.status?.command) return "running";
	return "idle";
}

/** A folder as people say it: the home folder as `~`. */
export function shortPath(path: string): string {
	return path.replace(/^(\/home\/[^/]+|\/Users\/[^/]+|\/root)(?=\/|$)/, "~");
}

/** "localhost:5173", "bun test --watch", "~/grid", or "exit 0 · 1d ago". */
export function detailOf(terminal: TerminalInfo): string {
	if (terminal.exitCode !== null) {
		const when = terminal.endedAt ? ` · ${relativeTime(terminal.endedAt)}` : "";
		return `exit ${terminal.exitCode}${when}`;
	}
	const status = terminal.status;
	if (status?.ports.length) {
		const more = status.ports.length > 1 ? ` +${status.ports.length - 1}` : "";
		return `localhost:${status.ports[0]}${more}`;
	}
	if (status?.command) return status.command;
	return shortPath(status?.cwd ?? terminal.cwd);
}

/** Where the shell is now, short. */
export function whereOf(terminal: TerminalInfo): string {
	return shortPath(terminal.status?.cwd ?? terminal.cwd);
}
