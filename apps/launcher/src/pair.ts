import { join, resolve } from "node:path";

import { readLaunchConfig } from "./config";
import { tailnetSelf } from "./tailnet";

/**
 * `bun run grid:pair`, on the environment: its tailnet address and a fresh one-time code, to
 * type into Settings → Environments on the home Grid.
 */
const root = resolve(import.meta.dir, "../../..");
const config = readLaunchConfig(process.env, root);
const self = await tailnetSelf();
if (!config.pairing || !self) {
	console.error(
		self
			? "Pairing is off here. Set GRID_PAIRING=1 and restart Grid."
			: "This machine is not on a tailnet yet. In a Codespace, add a TS_AUTH_KEY secret and rebuild; elsewhere, run tailscale up.",
	);
	process.exit(1);
}
const child = Bun.spawn(["bun", "src/pair.ts"], {
	cwd: join(root, "apps/runner"),
	env: {
		...process.env,
		RUNNER_PAIRING: "1",
		RUNNER_CHAT_DB: join(config.dataDir, "chat.db"),
	},
	stdout: "inherit",
	stderr: "inherit",
});
if ((await child.exited) === 0) console.log(`Address: http://${self.dnsName}:${config.runnerPort}`);
process.exit(await child.exited);
