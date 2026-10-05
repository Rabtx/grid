import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * How an environment is deployed to, worked out from the project's GitHub Actions workflows: a
 * job that deploys to it (`environment: production`) and what starts that job — a release tag, a
 * branch, or a button (`workflow_dispatch`). A person can name a command instead, for a host that
 * deploys some other way. Promoting and rolling back go through whichever applies.
 */
export type DeployMethod =
	/** A new tag starts the deploy (`on: push: tags: v*`). */
	| { kind: "tag"; prefix: string; workflow: string }
	/** Moving a branch starts it (`on: push: branches: [production]`). */
	| { kind: "branch"; branch: string; workflow: string }
	/** The workflow is run by hand, on a ref. */
	| { kind: "dispatch"; workflow: string }
	/** A command a person set, run in the project's folder. */
	| { kind: "command"; command: string };

type Job = { environment?: unknown; if?: unknown };
type Workflow = { on?: unknown; jobs?: Record<string, Job> };

function environmentName(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string")
		return (value as { name: string }).name;
	return null;
}

function list(value: unknown): string[] {
	if (typeof value === "string") return [value];
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

/** The events a workflow starts on, with their filters (`on: push`, `on: [push]`, `on: {push: …}`). */
function triggers(on: unknown): Map<string, Record<string, unknown>> {
	const found = new Map<string, Record<string, unknown>>();
	if (typeof on === "string") found.set(on, {});
	else if (Array.isArray(on)) for (const name of list(on)) found.set(name, {});
	else if (on && typeof on === "object")
		for (const [name, filter] of Object.entries(on as Record<string, unknown>))
			found.set(
				name,
				filter && typeof filter === "object" ? (filter as Record<string, unknown>) : {},
			);
	return found;
}

/** A glob's fixed start: `v*` → `v`, `release-*` → `release-`. */
function globPrefix(glob: string): string {
	const star = glob.search(/[*?[]/);
	return star === -1 ? glob : glob.slice(0, star);
}

/** How one workflow deploys to the environment, or null when none of its jobs does. */
export function methodIn(
	file: string,
	workflow: Workflow,
	environment: string,
): DeployMethod | null {
	const jobs = Object.values(workflow.jobs ?? {});
	const job = jobs.find(
		(item) => environmentName(item.environment)?.toLowerCase() === environment.toLowerCase(),
	);
	if (!job) return null;
	const condition = typeof job.if === "string" ? job.if : "";
	const on = triggers(workflow.on);
	const push = on.get("push");
	// `if: startsWith(github.ref, 'refs/tags/v')`, or a workflow that only starts on tags.
	const tagInCondition = condition.match(/refs\/tags\/([\w.\-/]*)/);
	if (tagInCondition) return { kind: "tag", prefix: tagInCondition[1], workflow: file };
	const tags = list(push?.tags);
	if (tags[0] && !list(push?.branches).length && !/refs\/heads\//.test(condition))
		return { kind: "tag", prefix: globPrefix(tags[0]), workflow: file };
	const branchInCondition = condition.match(/refs\/heads\/([\w.\-/]+)/);
	const branches = list(push?.branches).filter((branch) => !/[*?[]/.test(branch));
	const branch = branchInCondition?.[1] ?? (branches.length === 1 ? branches[0] : undefined);
	if (branch) return { kind: "branch", branch, workflow: file };
	if (on.has("workflow_dispatch")) return { kind: "dispatch", workflow: file };
	return null;
}

/** The project's workflows, read and parsed; one that does not parse is skipped. */
export function readWorkflows(folder: string): { file: string; workflow: Workflow }[] {
	const dir = join(folder, ".github", "workflows");
	let files: string[];
	try {
		files = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
	} catch {
		return [];
	}
	const found: { file: string; workflow: Workflow }[] = [];
	for (const file of files.sort()) {
		try {
			const parsed = Bun.YAML.parse(readFileSync(join(dir, file), "utf8"));
			if (parsed && typeof parsed === "object") found.push({ file, workflow: parsed as Workflow });
		} catch (cause) {
			console.warn(
				`[runner] skipped workflow ${file}:`,
				cause instanceof Error ? cause.message : cause,
			);
		}
	}
	return found;
}

/** The environments the workflows deploy to, by name. */
export function workflowEnvironments(
	workflows: readonly { file: string; workflow: Workflow }[],
): string[] {
	const names = new Set<string>();
	for (const { workflow } of workflows)
		for (const job of Object.values(workflow.jobs ?? {})) {
			const name = environmentName(job.environment);
			// `${{ inputs.environment }}` is not a name.
			if (name && !name.includes("${{")) names.add(name);
		}
	return [...names];
}

/** How the environment deploys, from the workflows: a tag first, then a branch, then by hand. */
export function detectMethod(
	workflows: readonly { file: string; workflow: Workflow }[],
	environment: string,
): DeployMethod | null {
	const found = workflows
		.map(({ file, workflow }) => methodIn(file, workflow, environment))
		.filter((item): item is DeployMethod => item !== null);
	const rank = { tag: 0, branch: 1, dispatch: 2, command: 3 } as const;
	return found.sort((a, b) => rank[a.kind] - rank[b.kind])[0] ?? null;
}

/** The method in words, for the screen. */
export function describeMethod(method: DeployMethod | null): string {
	if (!method) return "Grid can't tell how this environment deploys";
	switch (method.kind) {
		case "tag":
			return `A ${method.prefix}x.y.z release tag starts ${method.workflow}`;
		case "branch":
			return `Moving ${method.branch} starts ${method.workflow}`;
		case "dispatch":
			return `${method.workflow} is run on the commit`;
		case "command":
			return `Runs ${method.command}`;
	}
}
