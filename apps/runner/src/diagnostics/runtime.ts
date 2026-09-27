import type { DiagnosticJournal } from "./journal";

/** Record process failures without writing exception messages, stacks or rejection values. */
export function installProcessDiagnostics(journal: DiagnosticJournal): void {
	// The rethrow that keeps a rejection fatal; it was recorded already as the rejection.
	const rethrown = new WeakSet<Error>();
	process.on("uncaughtExceptionMonitor", (error, origin) => {
		if (rethrown.has(error)) return;
		record(journal, "uncaught", error, { origin });
	});
	process.on("unhandledRejection", (reason) => {
		record(journal, "unhandled rejection", reason);
		const fatal = new Error("Unhandled runner rejection");
		rethrown.add(fatal);
		queueMicrotask(() => {
			throw fatal;
		});
	});
}

function record(
	journal: DiagnosticJournal,
	message: string,
	value: unknown,
	details: Record<string, unknown> = {},
): void {
	const errorName =
		value instanceof Error && /^[\w.-]{1,80}$/.test(value.name) ? value.name : "UnknownError";
	try {
		journal.record({
			kind: "error",
			source: "process",
			workspace: null,
			message: `Runner ${message}`,
			details: { ...details, errorName },
		});
	} catch {
		console.error("[runner] could not write a process diagnostic event");
	}
	console.error(`[runner] recorded ${message} (${errorName})`);
}
