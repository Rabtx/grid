/**
 * A repository's deployments as GitHub records them — whatever deployed them (an Actions job,
 * Vercel, Render, Netlify) posts a deployment and its statuses there — grouped into the project's
 * environments: production, staging, one preview per pull request, and any other it names.
 */

export type DeployState = "live" | "success" | "failed" | "running" | "inactive";

export type Deployment = {
	id: number;
	environment: string;
	sha: string;
	ref: string | null;
	/** What it shipped: the commit's subject, or for a merge commit the pull request's title. */
	title: string;
	/** Who made the commit, or the bot that deployed it. */
	author: string;
	/** The GitHub account (or app) that posted the deployment. */
	creator: string;
	createdAt: string;
	/** When its last status was posted: done, for one that finished. */
	finishedAt: string | null;
	state: DeployState;
	url: string | null;
	logUrl: string | null;
};

export type EnvironmentKind = "production" | "staging" | "preview" | "other";

/** Raw deployment nodes from the GraphQL query below. */
export type DeploymentNode = {
	databaseId: number;
	environment: string | null;
	createdAt: string;
	state: string | null;
	ref: { name: string } | null;
	commitOid: string;
	commit: {
		messageHeadline: string;
		messageBody: string;
		author: { name: string | null; user: { login: string } | null } | null;
	} | null;
	creator: { login: string } | null;
	latestStatus: {
		state: string;
		environmentUrl: string | null;
		logUrl: string | null;
		createdAt: string;
	} | null;
};

export const DEPLOYMENTS_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name target { oid } }
    deployments(first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        databaseId environment createdAt state
        ref { name }
        commitOid
        commit { messageHeadline messageBody author { name user { login } } }
        creator { login }
        latestStatus { state environmentUrl logUrl createdAt }
      }
    }
    refs(refPrefix: "refs/tags/", first: 100, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
      nodes { name target { oid ... on Tag { target { oid } } } }
    }
  }
}`;

const MERGE = /^Merge (pull request|branch) /;

/** A commit's subject as a person would name the change: a merge commit says what it merged. */
export function changeTitle(headline: string, body: string): string {
	if (MERGE.test(headline)) {
		// GitHub cuts a long subject with "…" and carries the rest ("…ions") into the body.
		const lines = body.split("\n").map((line) => line.trim());
		const start = lines[0]?.startsWith("…") ? 1 : 0;
		const first = lines.slice(start).find(Boolean);
		if (first) return first;
	}
	return headline;
}

function deployState(node: DeploymentNode): DeployState {
	const status = node.latestStatus?.state ?? node.state ?? "";
	switch (status.toUpperCase()) {
		case "SUCCESS":
		case "ACTIVE":
			return "success";
		case "FAILURE":
		case "ERROR":
			return "failed";
		case "PENDING":
		case "QUEUED":
		case "IN_PROGRESS":
		case "WAITING":
			return "running";
		default:
			return "inactive";
	}
}

export function readDeployment(node: DeploymentNode): Deployment {
	const commit = node.commit;
	return {
		id: node.databaseId,
		environment: node.environment ?? "default",
		sha: node.commitOid,
		ref: node.ref?.name ?? null,
		title: commit
			? changeTitle(commit.messageHeadline, commit.messageBody)
			: node.commitOid.slice(0, 7),
		author: commit?.author?.user?.login ?? commit?.author?.name ?? node.creator?.login ?? "someone",
		creator: node.creator?.login ?? "",
		createdAt: node.createdAt,
		finishedAt: node.latestStatus?.createdAt ?? null,
		state: deployState(node),
		url: node.latestStatus?.environmentUrl || null,
		logUrl: node.latestStatus?.logUrl || null,
	};
}

const PREVIEW = /preview|^pr[-_ ]?\d+$|#\d+|pull/i;
const PRODUCTION = /^prod(uction)?\b/i;
const STAGING = /stag|^qa\b|uat|^test/i;

export function environmentKind(name: string): EnvironmentKind {
	if (PRODUCTION.test(name)) return "production";
	if (PREVIEW.test(name)) return "preview";
	if (STAGING.test(name)) return "staging";
	return "other";
}

/** The host that deployed it, by the account that posted the deployment. */
export function hostOf(creator: string): string | null {
	const login = creator.toLowerCase();
	if (login.includes("vercel")) return "Vercel";
	if (login.includes("netlify")) return "Netlify";
	if (login.includes("render")) return "Render";
	if (login.includes("railway")) return "Railway";
	if (login.includes("cloudflare")) return "Cloudflare";
	if (login.includes("fly")) return "Fly.io";
	if (login.includes("heroku")) return "Heroku";
	return null;
}

/**
 * A deployment's environment's history, newest first, with the one serving now marked live: the
 * newest that succeeded (a newer failed one left it serving).
 */
export function historyOf(deployments: readonly Deployment[]): Deployment[] {
	const live = deployments.find((item) => item.state === "success");
	return deployments.map((item) => (item === live ? { ...item, state: "live" } : item));
}

export type EnvironmentGroup = {
	name: string;
	kind: EnvironmentKind;
	/** Newest first, the one serving marked live. */
	history: Deployment[];
};

const ORDER: Record<EnvironmentKind, number> = { production: 0, staging: 1, other: 2, preview: 3 };

/**
 * Deployments grouped by environment: production first, then staging, others, previews. `named`
 * are environments a workflow deploys to, listed even before their first deploy.
 */
export function groupEnvironments(
	deployments: readonly Deployment[],
	named: readonly string[] = [],
): EnvironmentGroup[] {
	const groups = new Map<string, Deployment[]>();
	for (const item of deployments) {
		const list = groups.get(item.environment) ?? [];
		list.push(item);
		groups.set(item.environment, list);
	}
	const known = new Set([...groups.keys()].map((name) => name.toLowerCase()));
	for (const name of named) if (!known.has(name.toLowerCase())) groups.set(name, []);
	return [...groups]
		.map(([name, list]) => ({ name, kind: environmentKind(name), history: historyOf(list) }))
		.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name));
}

/** Tags by the commit they point at (an annotated tag through its tag object). */
export function tagsByCommit(
	nodes: readonly { name: string; target: { oid: string; target?: { oid: string } } | null }[],
): Map<string, string[]> {
	const found = new Map<string, string[]>();
	for (const node of nodes) {
		const oid = node.target?.target?.oid ?? node.target?.oid;
		if (!oid) continue;
		found.set(oid, [...(found.get(oid) ?? []), node.name]);
	}
	return found;
}

/** A commit's name: its release tag (the plainest, `v1.2.3` over `v1.2.3-beta`), or its short sha. */
export function versionOf(sha: string, tags: Map<string, string[]>): string {
	const names = tags.get(sha) ?? [];
	const plain = names.find((name) => /^v?\d+\.\d+\.\d+$/.test(name));
	return plain ?? names[0] ?? sha.slice(0, 7);
}

/**
 * The next release tag after the newest with this prefix: its patch number up one (`v0.8.3` →
 * `v0.8.4`), or `<prefix>0.1.0` for the first.
 */
export function nextVersion(tags: readonly string[], prefix: string): string {
	const pattern = new RegExp(
		`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)\\.(\\d+)\\.(\\d+)$`,
	);
	let best: [number, number, number] | null = null;
	for (const tag of tags) {
		const match = pattern.exec(tag);
		if (!match) continue;
		const version: [number, number, number] = [
			Number(match[1]),
			Number(match[2]),
			Number(match[3]),
		];
		if (
			!best ||
			version[0] > best[0] ||
			(version[0] === best[0] &&
				(version[1] > best[1] || (version[1] === best[1] && version[2] > best[2])))
		)
			best = version;
	}
	return best ? `${prefix}${best[0]}.${best[1]}.${best[2] + 1}` : `${prefix}0.1.0`;
}

/** Seconds between a deployment's start and its last status, for one that finished. */
export function durationOf(item: Deployment): number | null {
	if (!item.finishedAt || item.state === "running") return null;
	const seconds = Math.round((Date.parse(item.finishedAt) - Date.parse(item.createdAt)) / 1000);
	return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}
