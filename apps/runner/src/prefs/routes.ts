import { signingKey } from "./git";
import {
	type Channels,
	NOTIFY_KINDS,
	type NotifyKind,
	type PersonPrefs,
	type PrefsStore,
	type QuietHours,
} from "./store";

export class PrefsError extends Error {
	constructor(message: string) {
		super(message);
	}
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function record(value: unknown, what: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new PrefsError(`Invalid ${what}`);
	return value as Record<string, unknown>;
}

function flag(value: unknown, what: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") throw new PrefsError(`${what} must be on or off`);
	return value;
}

function text(value: unknown, what: string, max: number): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === "") return null;
	if (typeof value !== "string" || value.length > max) throw new PrefsError(`Invalid ${what}`);
	return value.trim();
}

function defined<T extends object>(value: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([, item]) => item !== undefined),
	) as Partial<T>;
}

function validZone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/** A change to a person's prefs, checked field by field and laid over what they have. */
export function patchPrefs(current: PersonPrefs, raw: unknown): PersonPrefs {
	const patch = record(raw, "settings");
	const next: PersonPrefs = structuredClone(current);
	if (patch.git !== undefined) {
		const git = record(patch.git, "git identity");
		const email = text(git.email, "email", 200);
		if (email && !/^[^\s@<>]+@[^\s@<>]+$/.test(email)) throw new PrefsError("Invalid email");
		Object.assign(
			next.git,
			defined({
				name: text(git.name, "name", 100),
				email,
				creditAgent: flag(git.creditAgent, "Credit the agent"),
				signCommits: flag(git.signCommits, "Sign commits"),
			}),
		);
	}
	if (patch.notify !== undefined) {
		const notify = record(patch.notify, "notifications");
		if (notify.channels !== undefined) {
			const channels = record(notify.channels, "channels");
			for (const [kind, value] of Object.entries(channels)) {
				if (!NOTIFY_KINDS.includes(kind as NotifyKind)) throw new PrefsError(`Unknown ${kind}`);
				const channel = record(value, kind);
				Object.assign(
					next.notify.channels[kind as NotifyKind],
					defined<Channels>({
						desktop: flag(channel.desktop, "Desktop") as boolean,
						phone: flag(channel.phone, "Phone") as boolean,
					}),
				);
			}
		}
		if (notify.quiet !== undefined) {
			const quiet = record(notify.quiet, "quiet hours");
			for (const key of ["from", "to"] as const)
				if (quiet[key] !== undefined && (typeof quiet[key] !== "string" || !TIME.test(quiet[key])))
					throw new PrefsError("Quiet hours take a time like 22:00");
			if (
				quiet.timezone !== undefined &&
				(typeof quiet.timezone !== "string" || !validZone(quiet.timezone))
			)
				throw new PrefsError("Unknown time zone");
			Object.assign(
				next.notify.quiet,
				defined<QuietHours>({
					on: flag(quiet.on, "Quiet hours") as boolean,
					from: quiet.from as string,
					to: quiet.to as string,
					timezone: quiet.timezone as string,
					approvalsThrough: flag(quiet.approvalsThrough, "Let approvals through") as boolean,
					weekends: flag(quiet.weekends, "Weekends") as boolean,
				}),
			);
		}
		Object.assign(
			next.notify,
			defined({
				lockScreen: flag(notify.lockScreen, "Approve from lock screen"),
			}),
		);
	}
	return next;
}

/** `GET /prefs` and `PATCH /prefs`: a person's own settings, with this machine's signing key. */
export async function prefsRequest(
	request: Request,
	url: URL,
	userId: string,
	store: PrefsStore,
): Promise<Response | null> {
	if (url.pathname !== "/prefs") return null;
	const answer = (prefs: PersonPrefs) =>
		Response.json({ data: { prefs, signingKey: signingKey() } });
	if (request.method === "GET") return answer(store.get(userId));
	if (request.method !== "PATCH")
		return Response.json({ message: "Use GET or PATCH" }, { status: 405 });
	const text = await request.text();
	if (text.length > 16_384)
		return Response.json({ message: "That is too much to save" }, { status: 413 });
	try {
		const body: unknown = JSON.parse(text || "null");
		return answer(store.set(userId, patchPrefs(store.get(userId), body)));
	} catch (cause) {
		if (cause instanceof PrefsError || cause instanceof SyntaxError)
			return Response.json(
				{ message: cause instanceof PrefsError ? cause.message : "Send JSON" },
				{ status: 400 },
			);
		throw cause;
	}
}
