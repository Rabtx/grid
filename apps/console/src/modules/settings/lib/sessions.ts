import type { SignInSession } from "../services/account.service";

/** Sessions shown before "Show all": the list can run to hundreds after months of sign-ins. */
export const SESSIONS_SHOWN = 5;

/** This device first, then the most recently used. */
export function orderSessions(sessions: readonly SignInSession[]): SignInSession[] {
	return [...sessions].sort(
		(a, b) =>
			Number(b.isCurrent) - Number(a.isCurrent) ||
			Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt),
	);
}
