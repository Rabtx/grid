import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Gh } from "../github/gh";

/**
 * Pulse → Shipping, straight from GitHub: how many deploys and merged pull requests a workspace's
 * projects had in a period, how long a pull request took from opened to merged, and who merged
 * them — agents (Grid's own branches, bots) or people.
 */
export type Shipping = {
	deploys: number;
	merged: number;
	/** Median hours from a pull request opened to merged, or null with none merged. */
	leadTimeHours: number | null;
	byAgents: number;
	byPeople: number;
	repositories: number;
	/** Repositories GitHub did not answer for, with why. */
	failed: { repository: string; reason: string }[];
};

type Pull = {
	number: number;
	createdAt: string;
	mergedAt: string | null;
	headRefName: string;
	author: { login?: string; is_bot?: boolean } | null;
	body?: string | null;
};

// Branches coding agents name for themselves.
const AGENT_BRANCH =
	/^(grid|agent|agents|claude|codex|copilot|cursor|devin|jules|opencode|sweep|aider)[/-]/i;
// What agents sign their pull requests with.
const AGENT_SIGNATURE =
	/generated with \[?(claude code|codex|cursor|devin|opencode|aider)|co-authored-by:\s*(claude|codex|copilot|cursor|devin)/i;

/** `owner/name` from a folder's GitHub remote, when it has one. */
export function githubRepository(folder: string): string | null {
	try {
		const config = readFileSync(join(folder, ".git", "config"), "utf8");
		const url = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(config)?.[1] ?? "";
		const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(url);
		return match ? `${match[1]}/${match[2]}` : null;
	} catch {
		return null;
	}
}

/**
 * A pull request an agent made: from a Grid thread's branch or one an agent named, signed by an
 * agent in its description, or opened by a bot.
 */
export function byAgent(pull: Pull, agentBranches: ReadonlySet<string>): boolean {
	return (
		agentBranches.has(pull.headRefName) ||
		AGENT_BRANCH.test(pull.headRefName) ||
		AGENT_SIGNATURE.test(pull.body ?? "") ||
		pull.author?.is_bot === true ||
		(pull.author?.login ?? "").endsWith("[bot]")
	);
}

export function median(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? (sorted[middle] ?? null)
		: ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export async function shipping(
	gh: Gh,
	folders: Record<string, string>,
	agentBranches: (project: string) => ReadonlySet<string>,
	since: Date,
): Promise<Shipping> {
	const day = since.toISOString().slice(0, 10);
	const seen = new Map<string, string>();
	for (const [project, folder] of Object.entries(folders)) {
		const repository = existsSync(folder) ? githubRepository(folder) : null;
		if (repository && !seen.has(repository.toLowerCase()))
			seen.set(repository.toLowerCase(), project);
	}
	const result: Shipping = {
		deploys: 0,
		merged: 0,
		leadTimeHours: null,
		byAgents: 0,
		byPeople: 0,
		repositories: seen.size,
		failed: [],
	};
	const hours: number[] = [];
	await Promise.all(
		[...seen].map(async ([key, project]) => {
			const repository = key;
			const pulls = await gh.run(
				[
					"pr",
					"list",
					"--repo",
					repository,
					"--state",
					"merged",
					"--search",
					`merged:>=${day}`,
					"--limit",
					"300",
					"--json",
					"number,createdAt,mergedAt,headRefName,author,body",
				],
				{ timeoutMs: 30_000 },
			);
			if (pulls.code !== 0) {
				result.failed.push({
					repository,
					reason: pulls.stderr.trim().split("\n")[0] || "GitHub did not answer",
				});
				return;
			}
			const branches = agentBranches(project);
			for (const pull of JSON.parse(pulls.stdout || "[]") as Pull[]) {
				if (!pull.mergedAt) continue;
				result.merged++;
				if (byAgent(pull, branches)) result.byAgents++;
				else result.byPeople++;
				hours.push((Date.parse(pull.mergedAt) - Date.parse(pull.createdAt)) / 3_600_000);
			}
			const deploys = await gh.run(
				[
					"api",
					`repos/${repository}/deployments?per_page=100`,
					"--jq",
					`[.[] | select(.created_at >= "${day}")] | length`,
				],
				{ timeoutMs: 30_000 },
			);
			if (deploys.code === 0) result.deploys += Number(deploys.stdout.trim()) || 0;
		}),
	);
	const lead = median(hours);
	result.leadTimeHours = lead === null ? null : Math.round(lead * 10) / 10;
	return result;
}
