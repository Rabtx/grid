import type { GridTool } from "./hub";

/**
 * The board, for agents: Grid tools that list a thread's project tasks, add one and move or edit
 * one. They go to the API with the runner's key and act as the person whose thread it is, so an
 * agent can do exactly what its person could on the board, in that thread's project and no other.
 */

export const TASK_STATUSES = [
	"backlog",
	"ready",
	"in_progress",
	"review",
	"qa",
	"blocked",
	"done",
] as const;

type Task = {
	number: number;
	key: string;
	title: string;
	status: string;
	description?: string | null;
	ownerName?: string | null;
};

export type BoardApi = { url: string; key: string };
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function call<T>(
	api: BoardApi,
	path: string,
	init: RequestInit = {},
	fetcher: Fetch = fetch,
): Promise<T> {
	let response: Response;
	try {
		response = await fetcher(`${api.url}/api/v1/runner/tasks/${path}`, {
			...init,
			headers: {
				authorization: `Runner ${api.key}`,
				"content-type": "application/json",
				...init.headers,
			},
		});
	} catch {
		throw new Error(
			"Grid's API is not reachable from this machine, so the board cannot be changed now.",
		);
	}
	const body = (await response.json().catch(() => null)) as {
		data?: T;
		message?: string;
		error?: { message?: string };
	} | null;
	if (!response.ok)
		throw new Error(
			body?.message ?? body?.error?.message ?? `The board answered ${response.status}`,
		);
	return body?.data as T;
}

const line = (task: Task) =>
	`${task.key} [${task.status}] ${task.title}${task.ownerName ? ` (owner: ${task.ownerName})` : ""}`;

function text(args: Record<string, unknown>, key: string, max: number): string | undefined {
	const value = args[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be text`);
	if (value.length > max) throw new Error(`${key} is longer than ${max} characters`);
	return value.trim();
}

function status(args: Record<string, unknown>): string | undefined {
	const value = args.status;
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || !(TASK_STATUSES as readonly string[]).includes(value))
		throw new Error(`status must be one of ${TASK_STATUSES.join(", ")}`);
	return value;
}

/** The board's tools, or none when this runner has no way to reach Grid's API. */
export function boardTools(api: BoardApi | null, fetcher: Fetch = fetch): GridTool[] {
	if (!api) return [];
	const where = (session: { workspaceId: string; project: string }) =>
		`${encodeURIComponent(session.workspaceId)}/${encodeURIComponent(session.project)}`;
	return [
		{
			name: "board_list_tasks",
			description:
				"List the tasks on this project's Grid board: each task's key (GRID-12), status and title. Pass status to list only one column.",
			inputSchema: {
				type: "object",
				properties: { status: { type: "string", enum: [...TASK_STATUSES] } },
			},
			run: async (session, args) => {
				const wanted = status(args);
				const tasks = await call<Task[]>(
					api,
					`${where(session)}?user=${encodeURIComponent(session.ownerId)}`,
					{},
					fetcher,
				);
				const shown = wanted ? tasks.filter((task) => task.status === wanted) : tasks;
				return shown.length ? shown.map(line).join("\n") : "No tasks there.";
			},
		},
		{
			name: "board_create_task",
			description:
				"Add a task to this project's Grid board. Use it for work worth tracking that you are not doing right now, or when asked to file it. Status defaults to backlog.",
			inputSchema: {
				type: "object",
				properties: {
					title: { type: "string" },
					description: { type: "string" },
					status: { type: "string", enum: [...TASK_STATUSES] },
				},
				required: ["title"],
			},
			run: async (session, args) => {
				const task = await call<Task>(
					api,
					where(session),
					{
						method: "POST",
						body: JSON.stringify({
							user: session.ownerId,
							task: {
								title: text(args, "title", 200),
								description: text(args, "description", 4000),
								status: status(args),
								ownerKind: "agent",
								ownerName: session.provider,
							},
						}),
					},
					fetcher,
				);
				return `Added ${line(task)}`;
			},
		},
		{
			name: "board_update_task",
			description:
				"Move a task on this project's Grid board to another status, or change its title or description. Name it by its number (12 for GRID-12).",
			inputSchema: {
				type: "object",
				properties: {
					number: { type: "integer" },
					status: { type: "string", enum: [...TASK_STATUSES] },
					title: { type: "string" },
					description: { type: "string" },
				},
				required: ["number"],
			},
			run: async (session, args) => {
				const number = args.number;
				if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1)
					throw new Error("number must be the task's number, such as 12 for GRID-12");
				const task = {
					...(status(args) ? { status: status(args) } : {}),
					...(text(args, "title", 200) ? { title: text(args, "title", 200) } : {}),
					...(args.description !== undefined
						? { description: text(args, "description", 4000) }
						: {}),
				};
				if (Object.keys(task).length === 0)
					throw new Error("Say what to change: status, title or description");
				const updated = await call<Task>(
					api,
					`${where(session)}/${number}`,
					{ method: "PATCH", body: JSON.stringify({ user: session.ownerId, task }) },
					fetcher,
				);
				return `Updated ${line(updated)}`;
			},
		},
	];
}
