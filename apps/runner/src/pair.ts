import { readConfig } from "./config";
import { PairingStore } from "./environments/pairing";

/**
 * `bun run pair`: a fresh one-time code for pairing this machine with a home Grid. Run it on the
 * environment (a Codespace terminal, say) and type the code into Settings → Environments at home.
 */
const config = readConfig();
if (!config.pairing) {
	console.error("Pairing is off on this runner. Start it with RUNNER_PAIRING=1 first.");
	process.exit(1);
}
const code = new PairingStore(config.chatDb).newCode();
console.log(`Pairing code: ${code}  (valid for 10 minutes, works once)`);
