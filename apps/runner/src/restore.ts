import type { Attachment } from "./chat/attachments";
import { ChatStore } from "./chat/store";
import { readConfig } from "./config";
import { type Machine, ThreadSync } from "./sync/thread-sync";

/**
 * Bringing another machine's threads onto this one from Grid's database: from the command line
 * (`bun run restore [machine]`) and from Settings → Machines. Each thread this machine does not
 * have yet is imported with its history and files (the agent's own session stays on the old
 * machine, so its next turn starts a fresh one, told what was said), then this machine takes them
 * over, so the old machine, should it come back, no longer changes them.
 */

type RemoteThread = {
	id: string;
	workspaceId: string;
	project: string;
	ownerId: string | null;
	provider: string;
	title: string;
	model: string | null;
	mode: string | null;
	effort: string | null;
	createdAt: string;
	updatedAt: string;
};
export type StoredMachine = {
	id: string;
	name: string | null;
	threads: number;
	lastSyncedAt: string;
};

export type RestoreDeps = {
	store: ChatStore;
	/** This machine, as Grid's database knows it, and marking what was imported as already sent. */
	sync: Pick<ThreadSync, "machine" | "markSynced">;
	api: { url: string; key: string };
	projectsDir: string;
	fetcher?: typeof fetch;
};

async function get<T>(deps: RestoreDeps, path: string): Promise<T> {
	const reply = await (deps.fetcher ?? fetch)(`${deps.api.url}/api/v1/runner${path}`, {
		headers: { authorization: `Runner ${deps.api.key}` },
	});
	if (!reply.ok) throw new Error(`${path}: the API answered ${reply.status}`);
	return ((await reply.json()) as { data: T }).data;
}

/** The other machines with threads in Grid's database, newest first; `skip` leaves some out. */
export async function storedMachines(
	deps: RestoreDeps,
	skip: (id: string) => boolean = () => false,
): Promise<StoredMachine[]> {
	return (await get<StoredMachine[]>(deps, "/machines")).filter(
		(machine) => machine.id !== deps.sync.machine.id && !skip(machine.id),
	);
}

/** Imports one machine's threads, then takes them over. */
export async function restoreMachine(
	deps: RestoreDeps,
	machine: StoredMachine,
): Promise<{ imported: number; total: number }> {
	const { store } = deps;
	const threads = await get<RemoteThread[]>(
		deps,
		`/machines/${encodeURIComponent(machine.id)}/threads`,
	);
	const imported: string[] = [];
	for (const thread of threads) {
		const events: { seq: number; data: unknown }[] = [];
		for (let after = 0; ;) {
			const page = await get<{ seq: number; data: unknown }[]>(
				deps,
				`/threads/${encodeURIComponent(thread.id)}/events?after=${after}`,
			);
			events.push(...page);
			if (page.length < 2000) break;
			after = page.at(-1)?.seq ?? after;
		}
		const folders = store.projectFolders(thread.workspaceId);
		const added = store.importThread(
			{
				id: thread.id,
				ownerId: thread.ownerId ?? "",
				workspaceId: thread.workspaceId,
				project: thread.project,
				provider: thread.provider,
				title: thread.title,
				cwd: folders[thread.project] ?? deps.projectsDir,
				model: thread.model,
				mode: thread.mode,
				effort: thread.effort,
				createdAt: thread.createdAt,
				updatedAt: thread.updatedAt,
			},
			events,
		);
		if (!added) continue;
		imported.push(thread.id);
		// Its attached files, where the runner keeps them, so the thread opens them here too.
		const files = await get<Attachment[]>(
			deps,
			`/threads/${encodeURIComponent(thread.id)}/attachments`,
		);
		for (const meta of files) {
			const file = await get<{ data: string }>(
				deps,
				`/threads/${encodeURIComponent(thread.id)}/attachments/${encodeURIComponent(meta.id)}`,
			);
			store.addAttachment(thread.id, meta, Buffer.from(file.data, "base64"));
		}
	}
	deps.sync.markSynced(imported);
	const claim = await (deps.fetcher ?? fetch)(
		`${deps.api.url}/api/v1/runner/machines/${encodeURIComponent(machine.id)}/claim`,
		{
			method: "POST",
			headers: { authorization: `Runner ${deps.api.key}`, "content-type": "application/json" },
			body: JSON.stringify({ machine: deps.sync.machine satisfies Machine }),
		},
	);
	if (!claim.ok) throw new Error(`claim: the API answered ${claim.status}`);
	return { imported: imported.length, total: threads.length };
}

/** `bun run restore [machine]`: lists the machines, or restores the one named (an id or its start). */
export async function restore(
	args: string[],
	env: Record<string, string | undefined> = process.env,
	fetcher: typeof fetch = fetch,
	log: (line: string) => void = console.log,
): Promise<number> {
	const config = readConfig(env);
	const key = env.GRID_RUNNER_KEY;
	if (!key) {
		log("This runner has no GRID_RUNNER_KEY, so it cannot reach Grid's database.");
		return 1;
	}
	const store = new ChatStore(config.chatDb);
	const sync = new ThreadSync(config.chatDb, { url: config.apiUrl, key }, fetcher);
	const deps: RestoreDeps = {
		store,
		sync,
		api: { url: config.apiUrl, key },
		projectsDir: config.projectsDir,
		fetcher,
	};
	try {
		const machines = await storedMachines(deps);
		const wanted = args[0];
		if (!wanted) {
			if (!machines.length) {
				log("No other machine has threads in Grid's database.");
				return 0;
			}
			log("Machines with threads in Grid's database:\n");
			for (const machine of machines)
				log(
					`  ${machine.id}  ${machine.name ?? "(no name)"} · ${machine.threads} threads · last sent ${machine.lastSyncedAt}`,
				);
			log("\nRestore one with: grid restore <machine id>");
			return 0;
		}
		const machine = machines.find((row) => row.id === wanted || row.id.startsWith(wanted));
		if (!machine) {
			log(`No machine ${wanted} has threads in Grid's database.`);
			return 1;
		}
		const { imported, total } = await restoreMachine(deps, machine);
		log(
			`Restored ${imported} of ${total} threads from ${machine.name ?? machine.id}. They are on this machine now.`,
		);
		return 0;
	} finally {
		sync.close();
		store.close();
	}
}

if (import.meta.main) {
	process.exit(await restore(process.argv.slice(2)));
}
