import { ChatStore } from "./chat/store";
import { readConfig } from "./config";
import { ThreadSync } from "./sync/thread-sync";

/**
 * `bun run restore [machine]`: brings another machine's threads onto this one from Grid's
 * database. Without a machine it lists the machines that have threads there. With one, it imports
 * each thread this machine does not have yet (history only: the agent's own session stays on the
 * old machine, so the next turn starts a fresh one), then takes them over, so the old machine,
 * should it come back, no longer changes them.
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
type MachineRow = { id: string; name: string | null; threads: number; lastSyncedAt: string };

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
	const get = async <T>(path: string): Promise<T> => {
		const reply = await fetcher(`${config.apiUrl}/api/v1/runner${path}`, {
			headers: { authorization: `Runner ${key}` },
		});
		if (!reply.ok) throw new Error(`${path}: the API answered ${reply.status}`);
		return ((await reply.json()) as { data: T }).data;
	};
	try {
		const machines = (await get<MachineRow[]>("/machines")).filter(
			(machine) => machine.id !== sync.machine.id,
		);
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
		const threads = await get<RemoteThread[]>(`/machines/${machine.id}/threads`);
		const imported: string[] = [];
		for (const thread of threads) {
			const events: { seq: number; data: unknown }[] = [];
			for (let after = 0; ;) {
				const page = await get<{ seq: number; data: unknown }[]>(
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
					cwd: folders[thread.project] ?? config.projectsDir,
					model: thread.model,
					mode: thread.mode,
					effort: thread.effort,
					createdAt: thread.createdAt,
					updatedAt: thread.updatedAt,
				},
				events,
			);
			if (added) imported.push(thread.id);
		}
		sync.markSynced(imported);
		const claim = await fetcher(`${config.apiUrl}/api/v1/runner/machines/${machine.id}/claim`, {
			method: "POST",
			headers: { authorization: `Runner ${key}`, "content-type": "application/json" },
			body: JSON.stringify({ machine: sync.machine }),
		});
		if (!claim.ok) throw new Error(`claim: the API answered ${claim.status}`);
		log(
			`Restored ${imported.length} of ${threads.length} threads from ${machine.name ?? machine.id}. They are on this machine now.`,
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
