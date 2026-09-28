/**
 * A tiny tick under the finger when a choice lands (a switch, a segment, a sheet swiped away):
 * phones only, where the vibration API exists; silent everywhere else.
 */
export function tap(): void {
	try {
		if (matchMedia("(pointer: coarse)").matches) navigator.vibrate?.(8);
	} catch {
		// No vibration here; the choice works the same without it.
	}
}
