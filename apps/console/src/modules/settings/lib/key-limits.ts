import type { AgentKey } from "../components/agent-keys-screen";

/** A key's limits in a line: when it expires, what it may spend and see. */
export function keyLimits(
	key: Pick<AgentKey, "expiresAt" | "budgetUsd" | "spentUsd" | "ownThreads">,
	now: number = Date.now(),
): string[] {
	const lines: string[] = [];
	if (key.expiresAt) {
		const days = Math.ceil((Date.parse(key.expiresAt) - now) / 86_400_000);
		lines.push(days <= 0 ? "expired" : `expires in ${days} day${days === 1 ? "" : "s"}`);
	}
	if (key.budgetUsd !== null)
		lines.push(`$${key.spentUsd.toFixed(2)} of $${key.budgetUsd.toFixed(2)} in 30 days`);
	if (key.ownThreads) lines.push("only its own threads");
	return lines;
}
