import type { DiagnosticInput, DiagnosticKind } from "./journal";

/** One kind of refused or unsigned request, as it is summarised; never paths, ids or tokens. */
export type Refusal = {
	kind: DiagnosticKind;
	source: string;
	/** What happened, e.g. "Sign-in refused"; the count is added to it. */
	label: string;
	details: Record<string, string | number>;
};

const WINDOW_MS = 60_000;
const MAX_KEYS = 64;
const OVERFLOW_KEY = "other";

type Tally = { refusal: Refusal; count: number; writtenAt: number };

/**
 * Refused and unsigned requests, counted in memory: the first of a kind is written at once and
 * the rest as at most one summary row per kind per minute, so a request loop without a token
 * cannot flood the journal or cost a write per request.
 */
export class RefusalTally {
	private readonly tallies = new Map<string, Tally>();

	constructor(
		private readonly record: (entry: DiagnosticInput) => void,
		private readonly now: () => number = Date.now,
	) {}

	note(key: string, refusal: Refusal): void {
		const bucket = this.tallies.has(key) || this.tallies.size < MAX_KEYS ? key : OVERFLOW_KEY;
		const existing = this.tallies.get(bucket);
		if (existing) {
			existing.count += 1;
			return;
		}
		const tally: Tally = {
			refusal:
				bucket === OVERFLOW_KEY
					? { kind: "error", source: "auth", label: "Other refused requests", details: {} }
					: refusal,
			count: 1,
			writtenAt: this.now(),
		};
		this.tallies.set(bucket, tally);
		this.write(tally);
		tally.count = 0;
	}

	/** Write the summaries whose minute is up and forget the kinds that went quiet. */
	flush(): void {
		const now = this.now();
		for (const [key, tally] of this.tallies) {
			if (now - tally.writtenAt < WINDOW_MS) continue;
			if (tally.count === 0) {
				this.tallies.delete(key);
				continue;
			}
			tally.writtenAt = now;
			this.write(tally);
			tally.count = 0;
		}
	}

	private write(tally: Tally): void {
		const { refusal, count } = tally;
		this.record({
			kind: refusal.kind,
			source: refusal.source,
			workspace: null,
			message: `${refusal.label} (${count} in the last minute)`,
			details: { ...refusal.details, count },
		});
	}
}
