import type { JSX } from "@solidjs/web";

import {
	BoardIcon,
	BoltIcon,
	BranchIcon,
	ChatIcon,
	DatabaseIcon,
	type FeedTone,
	GlobeIcon,
	HealthLabel,
	type HealthTone,
	InboxIcon,
	LayersIcon,
	NoteIcon,
	PaletteIcon,
	ShieldIcon,
	ToneTile,
} from "@/kit";

import type { CatalogService, Connection, Rule } from "../types/connector.types";

const GLYPHS: Record<string, { tone: FeedTone; icon: () => JSX.Element }> = {
	github: { tone: "neutral", icon: () => <BranchIcon /> },
	linear: { tone: "violet", icon: () => <BoardIcon /> },
	vercel: { tone: "neutral", icon: () => <GlobeIcon /> },
	sentry: { tone: "danger", icon: () => <ShieldIcon /> },
	stripe: { tone: "violet", icon: () => <LayersIcon /> },
	posthog: { tone: "warning", icon: () => <BoltIcon /> },
	supabase: { tone: "success", icon: () => <LayersIcon /> },
	cloudflare: { tone: "warning", icon: () => <GlobeIcon /> },
	slack: { tone: "violet", icon: () => <ChatIcon /> },
	intercom: { tone: "accent", icon: () => <InboxIcon /> },
	figma: { tone: "violet", icon: () => <PaletteIcon /> },
	notion: { tone: "neutral", icon: () => <NoteIcon /> },
	neon: { tone: "success", icon: () => <DatabaseIcon /> },
};

/** A service's tile, as the Figma catalog draws it; the workspace's own servers are blue. */
export function ConnectorGlyph(props: { kind: string }): JSX.Element {
	const glyph = () =>
		GLYPHS[props.kind] ?? { tone: "accent" as const, icon: () => <DatabaseIcon /> };
	return <ToneTile tone={glyph().tone}>{glyph().icon()}</ToneTile>;
}

const DAY = 24 * 60 * 60 * 1000;

/** How a connection is doing, in a word and a colour. */
export function healthOf(connection: Connection): { tone: HealthTone; label: string } {
	if (!connection.enabled) return { tone: "neutral", label: "Off" };
	if (connection.status === "signin") return { tone: "danger", label: "Sign in again" };
	if (connection.status === "error") return { tone: "danger", label: "Not answering" };
	if (connection.expiresAt) {
		const days = Math.max(0, Math.ceil((Date.parse(connection.expiresAt) - Date.now()) / DAY));
		return {
			tone: "warning",
			label:
				days === 0 ? "Token expires today" : `Token expires in ${days} day${days === 1 ? "" : "s"}`,
		};
	}
	return { tone: "success", label: "Healthy" };
}

export function Health(props: { connection: Connection }): JSX.Element {
	return (
		<HealthLabel tone={healthOf(props.connection).tone}>
			{healthOf(props.connection).label}
		</HealthLabel>
	);
}

/** Whether a connection needs signing in again to work. */
export function needsSignIn(connection: Connection): boolean {
	return connection.status === "signin" || connection.expiresAt !== null;
}

function lower(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
}

/** What agents may do with a connection, in a line: "Open PRs · merging asks you", "Read only". */
export function rulesSummary(connection: Pick<Connection, "capabilities" | "rules">): string {
	const rule = (id: string): Rule =>
		connection.rules[id] ??
		connection.capabilities.find((item) => item.id === id)?.initial ??
		"ask";
	const name = (item: Connection["capabilities"][number]) => item.short ?? item.label;
	const changes = connection.capabilities.filter((item) => item.id !== "read");
	const allowed = changes.filter((item) => rule(item.id) === "allow");
	const asking = changes.filter((item) => rule(item.id) === "ask");
	const reads = rule("read") !== "never";
	if (!allowed.length && !asking.length) return reads ? "Read only" : "No access";
	const first = allowed[0];
	const parts = [first ? name(first) : "Read only"];
	const asked = asking[0];
	if (asked) parts.push(`${lower(name(asked))} asks you`);
	return parts.join(" · ");
}

/** The catalog's categories, as the tabs over the page name them. */
export const CATEGORIES = [
	{ value: "all", label: "All" },
	{ value: "dev", label: "Dev" },
	{ value: "ship", label: "Ship" },
	{ value: "business", label: "Business" },
] as const;
export type CategoryFilter = (typeof CATEGORIES)[number]["value"];

/** A connection's catalog entry, when it came from the catalog. */
export function serviceOf(
	catalog: readonly CatalogService[],
	connection: Connection,
): CatalogService | undefined {
	return catalog.find((item) => item.id === connection.kind);
}

/** "Allow · Ask me · Never", as every rule control offers it. */
export const RULE_OPTIONS = [
	{ value: "allow", label: "Allow" },
	{ value: "ask", label: "Ask me" },
	{ value: "never", label: "Never" },
] as const;
