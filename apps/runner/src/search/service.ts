import { existsSync } from "node:fs";

import type { Who } from "../auth";
import type { ChatHub } from "../chat/hub";
import type { Gh } from "../github/gh";
import { githubRepository } from "../pulse/shipping";
import { type Answer, askPrompt, askWords, parseAnswer, type Source } from "./ask";
import { matchFiles, projectFiles } from "./files";

/** Tasks and notes, as the API finds them for a search. */
export type ApiFindings = {
	tasks: {
		project: string;
		projectName: string;
		number: number;
		title: string;
		status: string;
		passage: string | null;
		updatedAt: string;
	}[];
	notes: {
		project: string;
		projectName: string;
		id: string;
		title: string;
		passage: string;
		updatedAt: string;
	}[];
};

export type SearchDeps = {
	chat: ChatHub;
	gh: Gh;
	/** The API's search, asked as the person (their token and workspace). */
	apiSearch: (
		auth: { token: string; workspace: string },
		query: string,
		project: string | null,
	) => Promise<ApiFindings>;
};

export class SearchError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
		this.name = "SearchError";
	}
}

// Agents that answer from what they are given, in the order one is picked.
const ANSWERERS = ["claude", "codex", "opencode"];
const NO_ANSWERS = new Set(["antigravity", "freebuff"]);
const SOURCE_TEXT = 700;

const day = (iso: string) =>
	new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });

/** Words to look for: three letters or more. */
function searchWords(query: string): string[] {
	return [
		...new Set(
			query
				.toLowerCase()
				.split(/[^\p{L}\p{N}_.-]+/u)
				.filter((word) => word.length >= 2),
		),
	].slice(0, 8);
}

/**
 * Search and Ask Grid (Figma 25): threads and files found on this machine, tasks and notes from
 * the API; and questions answered by an agent from those, plus commits and pull requests, with the
 * sources it used numbered so every claim points at one.
 */
export class Search {
	constructor(private readonly deps: SearchDeps) {}

	private folders(workspace: string, project: string | null): Record<string, string> {
		const all = this.deps.chat.projectFolders(workspace);
		if (!project) return all;
		return all[project] ? { [project]: all[project] } : {};
	}

	/** What this machine finds: threads that mention the words, and files whose paths hold them. */
	async search(who: Who, input: { query: string; project: string | null }) {
		const words = searchWords(input.query);
		if (!words.length) return { threads: [], files: [] };
		const threads = this.deps.chat
			.searchThreads(who.workspace, words, 20)
			.filter((thread) => !input.project || thread.project === input.project)
			.slice(0, 6)
			.map(({ id, project, provider, title, updatedAt, passage }) => ({
				id,
				project,
				provider,
				title,
				updatedAt,
				passage,
			}));
		const files: { project: string; path: string }[] = [];
		for (const [project, folder] of Object.entries(this.folders(who.workspace, input.project))) {
			for (const path of matchFiles(await projectFiles(folder), words, 8))
				files.push({ project, path });
			if (files.length >= 8) break;
		}
		return { threads, files: files.slice(0, 8) };
	}

	/** Commits whose messages mention any of the words, across the projects' folders. */
	private async commits(folders: Record<string, string>, words: readonly string[]) {
		const found: { project: string; hash: string; subject: string; author: string; at: string }[] =
			[];
		for (const [project, folder] of Object.entries(folders)) {
			if (!existsSync(folder)) continue;
			const proc = Bun.spawn(
				[
					"git",
					"log",
					"--all",
					"-i",
					"-n",
					"4",
					...words.map((word) => `--grep=${word}`),
					"--format=%h%x09%s%x09%an%x09%cI",
				],
				{ cwd: folder, stdout: "pipe", stderr: "ignore" },
			);
			const text = await new Response(proc.stdout).text();
			await proc.exited;
			for (const line of text.split("\n").filter(Boolean)) {
				const [hash = "", subject = "", author = "", at = ""] = line.split("\t");
				found.push({ project, hash, subject, author, at });
			}
			if (found.length >= 4) break;
		}
		return found.slice(0, 4);
	}

	/** Pull requests that mention any of the words, on the projects' GitHub repositories. */
	private async pulls(folders: Record<string, string>, words: readonly string[]) {
		const found: {
			project: string;
			number: number;
			title: string;
			state: string;
			body: string;
			at: string;
		}[] = [];
		const seen = new Set<string>();
		for (const [project, folder] of Object.entries(folders)) {
			const repository = existsSync(folder) ? githubRepository(folder) : null;
			if (!repository || seen.has(repository)) continue;
			seen.add(repository);
			const result = await this.deps.gh.run(
				[
					"pr",
					"list",
					"--repo",
					repository,
					"--state",
					"all",
					"--search",
					words.slice(0, 4).join(" OR "),
					"--limit",
					"3",
					"--json",
					"number,title,state,body,updatedAt",
				],
				{ timeoutMs: 15_000 },
			);
			if (result.code !== 0) continue;
			for (const pull of JSON.parse(result.stdout || "[]") as {
				number: number;
				title: string;
				state: string;
				body: string;
				updatedAt: string;
			}[])
				found.push({
					project,
					number: pull.number,
					title: pull.title,
					state: pull.state,
					body: pull.body ?? "",
					at: pull.updatedAt,
				});
			if (found.length >= 3) break;
		}
		return found.slice(0, 3);
	}

	/** Everything a question could draw on that the person can see, numbered. */
	async sources(
		who: Who,
		auth: { token: string; workspace: string },
		question: string,
		project: string | null,
	): Promise<Source[]> {
		const words = askWords(question);
		if (!words.length) return [];
		const folders = this.folders(who.workspace, project);
		const [found, threads, commits, pulls] = await Promise.all([
			this.deps
				.apiSearch(auth, words.join(" "), project)
				.catch(() => ({ tasks: [], notes: [] }) as ApiFindings),
			Promise.resolve(this.deps.chat.searchThreads(who.workspace, words, 4)),
			this.commits(folders, words).catch(() => []),
			this.pulls(folders, words).catch(() => []),
		]);
		const sources: Omit<Source, "n">[] = [
			...found.notes.slice(0, 3).map((note) => ({
				kind: "note" as const,
				title: note.title,
				meta: `Note · ${day(note.updatedAt)} · ${note.projectName}`,
				href: `/notes/${note.project}/${note.id}`,
				text: note.passage,
			})),
			...threads
				.filter((thread) => !project || thread.project === project)
				.slice(0, 3)
				.map((thread) => ({
					kind: "thread" as const,
					title: thread.title,
					meta: `Thread · ${thread.provider} · ${day(thread.updatedAt)}`,
					href: `/chat/${thread.project}/${thread.id}`,
					text: thread.passage,
				})),
			...commits.map((commit) => ({
				kind: "commit" as const,
				title: `${commit.hash} · ${commit.subject}`,
				meta: `Commit in ${commit.project} · ${day(commit.at)} · ${commit.author}`,
				href: null,
				text: commit.subject,
			})),
			...pulls.map((pull) => ({
				kind: "pull" as const,
				title: `#${pull.number} · ${pull.title}`,
				meta: `Pull request · ${pull.state.toLowerCase()} ${day(pull.at)}`,
				href: `/pulls/${pull.project}/${pull.number}`,
				text: `${pull.title}\n${pull.body}`,
			})),
			...found.tasks.slice(0, 2).map((task) => ({
				kind: "task" as const,
				title: task.title,
				meta: `Task · ${task.projectName} · ${task.status}`,
				href: `/board/${task.project}/tasks/${task.number}`,
				text: `${task.title}${task.passage ? `\n${task.passage}` : ""}`,
			})),
		];
		return sources.slice(0, 10).map((source, index) => ({
			...source,
			n: index + 1,
			text: source.text.slice(0, SOURCE_TEXT),
		}));
	}

	/** The agent that answers: the workspace's default when it can, else the first that can. */
	private async answererFor(who: Who): Promise<string> {
		const available = (await this.deps.chat.providerList(who.userId))
			.filter((item) => item.available && !NO_ANSWERS.has(item.id))
			.map((item) => item.id);
		const preferred = who.settings?.defaultAgent;
		if (preferred && available.includes(preferred)) return preferred;
		const pick = ANSWERERS.find((id) => available.includes(id)) ?? available[0];
		if (!pick)
			throw new SearchError(
				"Install an agent to answer questions (Claude Code, Codex or opencode)",
				409,
			);
		return pick;
	}

	/** A question answered from what the person can see, with the sources it cites. */
	async ask(
		who: Who,
		auth: { token: string; workspace: string },
		input: {
			question: string;
			project: string | null;
			history: { question: string; answer: string }[];
		},
	): Promise<Answer & { sources: Omit<Source, "text">[]; agent: string | null }> {
		const question = input.question.trim().slice(0, 500);
		if (!question) throw new SearchError("Ask a question");
		const sources = await this.sources(who, auth, question, input.project);
		const strip = (list: Source[]) => list.map(({ text: _text, ...rest }) => rest);
		if (!sources.length)
			return {
				answer:
					"Grid found nothing about that in your notes, threads, tasks, commits or pull requests.",
				cited: [],
				followUps: [],
				sources: [],
				agent: null,
			};
		const agent = await this.answererFor(who);
		const folder = Object.values(this.folders(who.workspace, input.project))[0];
		if (!folder) throw new SearchError("Add a project first: agents work inside one", 409);
		const text = await this.deps.chat.answerOnce({
			provider: agent,
			cwd: folder,
			prompt: askPrompt(question, sources, input.history.slice(-3)),
		});
		const answer = parseAnswer(text, sources);
		return { ...answer, sources: strip(sources), agent };
	}
}
