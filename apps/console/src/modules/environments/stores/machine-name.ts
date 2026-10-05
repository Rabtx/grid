import { createSignal, untrack } from "solid-js";

import { machineService } from "../services/machine.service";

// This machine's name, read once and kept: the badge and the reconnecting notice both say it.
const [name, setName] = createSignal<string | null>(null);
let reading: Promise<void> | null = null;

export const machineName = {
	name,
	/** Read the name if it is not known yet; a runner that does not answer leaves it unknown. */
	load(token: string): Promise<void> {
		if (untrack(name)) return Promise.resolve();
		if (reading) return reading;
		const read = machineService
			.status(token)
			.then(
				(status) => {
					setName(status.info.hostname);
				},
				() => undefined,
			)
			.finally(() => {
				reading = null;
			});
		reading = read;
		return read;
	},
};
