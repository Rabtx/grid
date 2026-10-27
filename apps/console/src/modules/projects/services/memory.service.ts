import { runnerCall } from "@/lib/runner-client";
import { placementsStore } from "@/modules/environments/stores/placements";

export type MemoryKind = "decision" | "convention" | "fix" | "fact";

/** One thing a project keeps for later threads (the runner's `memory/project-memory.ts`). */
export type MemoryEntry = {
	id: string;
	project: string;
	kind: MemoryKind;
	text: string;
	by: { kind: "person" | "agent"; id: string; name: string };
	sessionId: string | null;
	createdAt: string;
	updatedAt: string;
	used: number;
	usedAt: string | null;
};

export const MEMORY_KINDS: { value: MemoryKind; label: string; hint: string }[] = [
	{ value: "decision", label: "Decision", hint: "What was chosen, and why" },
	{ value: "convention", label: "Convention", hint: "How this project does things" },
	{ value: "fix", label: "Fix", hint: "Why something broke, and what fixed it" },
	{ value: "fact", label: "Fact", hint: "Something that took finding out" },
];

/** A project's memory, on the machine the project runs on. */
const base = (project: string) => `${placementsStore.scopeOf(project)}/memory`;

export const memoryService = {
	list: (token: string, project: string, query = "") =>
		runnerCall<MemoryEntry[]>(
			`${base(project)}?project=${encodeURIComponent(project)}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`,
			token,
		),
	add: (token: string, project: string, input: { kind: MemoryKind; text: string }) =>
		runnerCall<MemoryEntry>(base(project), token, {
			method: "POST",
			body: JSON.stringify({ project, ...input }),
		}),
	edit: (token: string, project: string, id: string, input: { kind: MemoryKind; text: string }) =>
		runnerCall<MemoryEntry>(`${base(project)}/${id}`, token, {
			method: "PUT",
			body: JSON.stringify(input),
		}),
	remove: (token: string, project: string, id: string) =>
		runnerCall<void>(`${base(project)}/${id}`, token, { method: "DELETE" }),
};
