/** The teammate the last thread started as, so the next one does too (per device). */
export const ROLE_KEY = "grid.chat.role";

/** Start the next thread as this teammate, or as nobody. */
export function rememberRole(id: string | null): void {
	try {
		if (id) localStorage.setItem(ROLE_KEY, id);
		else localStorage.removeItem(ROLE_KEY);
	} catch {
		// Not remembered; the next thread starts without a teammate.
	}
}
