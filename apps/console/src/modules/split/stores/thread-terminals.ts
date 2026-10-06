import { accountStorage } from "@/lib/account-storage";
import { terminalsService } from "@/modules/terminal/services/terminals.service";
import type { TerminalInfo } from "@/modules/terminal/types/terminal.types";

const terminalKey = (thread: string) => `grid.split.terminal.${thread}`;

// A first guess; the view sizes the shell as soon as it measures.
const DEFAULT_SIZE = { cols: 80, rows: 24 };

// One open at a time per thread: two panes (or a quick double click) asking at once share it,
// so a thread never ends up with two shells.
const pending = new Map<string, Promise<TerminalInfo>>();

export type ThreadPlace = {
	thread: string;
	/** Where the thread works: its worktree, or the project's folder. */
	cwd: string;
	/** The environment the project runs on; absent for this machine. */
	environment?: string;
};

async function ensure(token: string, place: ThreadPlace): Promise<TerminalInfo> {
	const remembered = accountStorage.get(terminalKey(place.thread));
	if (remembered) {
		const list = await terminalsService.list(token, place.environment);
		const alive = list.find((item) => item.id === remembered && item.exitCode === null);
		if (alive) return alive;
	}
	const opened = await terminalsService.open(token, DEFAULT_SIZE, place.cwd, place.environment);
	accountStorage.set(terminalKey(place.thread), opened.id);
	return opened;
}

/**
 * Each thread's own shell, opened in the folder the thread works in. It outlives the screen (the
 * runner keeps it), so coming back to the thread finds the same scrollback; one whose shell has
 * ended is replaced by a fresh one.
 */
export const threadTerminals = {
	ensure(token: string, place: ThreadPlace): Promise<TerminalInfo> {
		const running = pending.get(place.thread);
		if (running) return running;
		const next = ensure(token, place).finally(() => pending.delete(place.thread));
		pending.set(place.thread, next);
		return next;
	},
	/** Start the thread's shell again, closing the old one. */
	async restart(token: string, place: ThreadPlace, current: string | null): Promise<TerminalInfo> {
		accountStorage.delete(terminalKey(place.thread));
		if (current) await terminalsService.close(token, current, place.environment).catch(() => {});
		return threadTerminals.ensure(token, place);
	},
	remembered(thread: string): string | null {
		return accountStorage.get(terminalKey(thread));
	},
};
