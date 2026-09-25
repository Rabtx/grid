/**
 * Passes a live link's state through, holding back "reconnecting" for a moment. Coming back to the
 * app usually reattaches in well under a second, and that should not flash a banner; a link that
 * stays down still shows it.
 */
export function quietReconnects<State extends string>(
	apply: (state: State) => void,
	quietMs = 2_000,
): { set: (state: State) => void; cancel: () => void } {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return {
		set(state) {
			if (state === "reconnecting") {
				timer ??= setTimeout(() => apply(state), quietMs);
				return;
			}
			clearTimeout(timer);
			timer = undefined;
			apply(state);
		},
		cancel() {
			clearTimeout(timer);
			timer = undefined;
		},
	};
}
