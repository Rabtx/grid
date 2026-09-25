import { localStore, saveSoon } from "@/lib/local-store";

/**
 * Each terminal's recent output, kept on the device with the byte offset it starts at. Opening
 * the terminal again draws it at once, and the runner sends only what came after
 * (`offset` = `at` + the bytes kept). Loaded together with the terminal list, so a terminal view
 * can read its screen without waiting.
 */

export type KeptScreen = { at: number; bytes: Uint8Array };

// Enough for a few screens of scrollback; older output is dropped from the front.
const LIMIT = 256 * 1024;

const screens = new Map<string, KeptScreen>();
const key = (id: string) => `terminal:${id}`;

/** Read the kept screens of these terminals into memory. */
export async function preloadScreens(ids: string[]): Promise<void> {
	await Promise.all(
		ids
			.filter((id) => !screens.has(id))
			.map(async (id) => {
				const kept = await localStore.get<KeptScreen>(key(id));
				if (kept && kept.bytes instanceof Uint8Array && Number.isInteger(kept.at)) {
					screens.set(id, kept);
				}
			}),
	);
}

export function keptScreen(id: string): KeptScreen | null {
	return screens.get(id) ?? null;
}

/** The terminal was closed: forget its screen. */
export function forgetScreen(id: string): void {
	screens.delete(id);
	void localStore.delete(key(id));
}

/** Keeps a terminal's output as it arrives, and saves it now and then. */
export function screenRecorder(id: string): {
	/** The screen started over at this byte offset. */
	reset: (at: number) => void;
	add: (bytes: Uint8Array) => void;
	flush: () => void;
	cancel: () => void;
} {
	const kept = screens.get(id);
	let at = kept?.at ?? 0;
	let chunks: Uint8Array[] = kept ? [kept.bytes] : [];
	let size = kept?.bytes.byteLength ?? 0;

	const snapshot = (): KeptScreen => {
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		chunks = [bytes];
		const screen = { at, bytes };
		screens.set(id, screen);
		return screen;
	};
	const saver = saveSoon(key(id), snapshot, 2_000);

	return {
		reset(next) {
			at = next;
			chunks = [];
			size = 0;
			saver.schedule();
		},
		add(bytes) {
			chunks.push(bytes);
			size += bytes.byteLength;
			while (size > LIMIT && chunks.length > 1) {
				const dropped = chunks.shift()?.byteLength ?? 0;
				size -= dropped;
				at += dropped;
			}
			if (size > LIMIT) {
				// One chunk larger than the limit: keep its tail.
				const only = chunks[0];
				const cut = only.byteLength - LIMIT;
				chunks = [only.subarray(cut)];
				size = LIMIT;
				at += cut;
			}
			saver.schedule();
		},
		flush: saver.flush,
		cancel: saver.cancel,
	};
}
