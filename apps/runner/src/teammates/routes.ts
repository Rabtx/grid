import type { Who } from "../auth";
import type { GridTool } from "../chat/hub";
import type { InboxDraft } from "../inbox/store";
import { may } from "../permissions";
import type { RoleStore } from "../roles/store";
import type { TeammateStore } from "./store";
import { type CardInput, TeammateError, type TeammateWork } from "./work";

export type TeammateDeps = {
	work: TeammateWork;
	store: TeammateStore;
	roles: Pick<RoleStore, "get">;
};

const LESSON_MAX = 300;
const TITLE_MAX = 300;
const BODY_MAX = 20_000;

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}

/** A card as the console sends it, checked; null when it is not one. */
function cardOf(input: unknown): CardInput | null {
	if (!input || typeof input !== "object") return null;
	const card = input as Record<string, unknown>;
	if (
		typeof card.number !== "number" ||
		!Number.isSafeInteger(card.number) ||
		card.number < 1 ||
		typeof card.key !== "string" ||
		!/^[A-Z0-9]{1,12}-\d+$/i.test(card.key) ||
		typeof card.title !== "string" ||
		!card.title.trim() ||
		card.title.length > TITLE_MAX
	)
		return null;
	const description = typeof card.description === "string" ? card.description : "";
	if (description.length > BODY_MAX) return null;
	return { number: card.number, key: card.key, title: card.title.trim(), description };
}

/** One lesson's words, tidied; null when there are none or too many. */
function lessonText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const text = value.replace(/\s+/g, " ").trim();
	return text && text.length <= LESSON_MAX ? text : null;
}

/**
 * Teammates at work over HTTP:
 * - `POST /teammates/:id/work` gives a card to a teammate; `GET /teammates/runs` lists runs
 *   (`?project=&task=&teammate=`), and `POST /teammates/runs/:id/{approve,stop,retry}` steer one;
 * - `GET /teammates/stats` is every teammate's scorecard;
 * - `GET|POST /teammates/:id/lessons`, `PATCH|DELETE /teammates/lessons/:id` and
 *   `GET /teammates/lessons/proposed` are what teammates have learned and what waits for approval.
 */
export async function teammateRequest(
	request: Request,
	url: URL,
	who: Who,
	deps: TeammateDeps,
): Promise<Response | null> {
	if (!url.pathname.startsWith("/teammates")) return null;
	const { work, store } = deps;
	const workspace = who.workspace;
	const body = async () => (await request.json().catch(() => ({}))) as Record<string, unknown>;
	try {
		if (url.pathname === "/teammates/runs" && request.method === "GET") {
			const task = Number(url.searchParams.get("task") ?? "");
			return Response.json({
				data: work.runs(workspace, {
					project: url.searchParams.get("project") || undefined,
					teammateId: url.searchParams.get("teammate") || undefined,
					...(Number.isSafeInteger(task) && task > 0 ? { taskNumber: task } : {}),
					limit: 100,
				}),
			});
		}
		if (url.pathname === "/teammates/stats" && request.method === "GET")
			return Response.json({ data: work.stats(workspace) });
		if (url.pathname === "/teammates/lessons/proposed" && request.method === "GET")
			return Response.json({ data: store.proposed(workspace) });

		const step = url.pathname.match(/^\/teammates\/runs\/([\w-]+)\/(approve|stop|retry)$/);
		if (step && request.method === "POST") {
			if (!may(who, "startAgents")) return failure(403, "Your role cannot run agents here");
			const [, id, action] = step;
			if (action === "approve") {
				const input = await body();
				const note = typeof input.note === "string" ? input.note.slice(0, 2000) : undefined;
				return Response.json({ data: work.approve(workspace, id, note) });
			}
			if (action === "stop") return Response.json({ data: work.stop(workspace, id) });
			return Response.json({ data: work.retry(workspace, id) });
		}

		const give = url.pathname.match(/^\/teammates\/([\w-]+)\/work$/);
		if (give && request.method === "POST") {
			if (!may(who, "startAgents")) return failure(403, "Your role cannot run agents here");
			const input = await body();
			const card = cardOf(input.task);
			if (typeof input.project !== "string" || !/^[a-z0-9-]+$/.test(input.project) || !card)
				return failure(400, "Say which project and card");
			return Response.json(
				{ data: work.start(who, give[1], input.project, card) },
				{ status: 201 },
			);
		}

		const lessons = url.pathname.match(/^\/teammates\/([\w-]+)\/lessons$/);
		if (lessons && lessons[1] !== "proposed") {
			if (!deps.roles.get(workspace, lessons[1])) return failure(404, "That teammate is gone");
			if (request.method === "GET")
				return Response.json({ data: store.lessons(workspace, lessons[1]) });
			if (request.method === "POST") {
				const text = lessonText((await body()).text);
				if (!text)
					return failure(400, `Write the lesson in one line, under ${LESSON_MAX} characters`);
				const lesson = store.addLesson(workspace, lessons[1], text, "kept");
				if (!lesson)
					return failure(409, "It already knows that, or keeps as many lessons as it can");
				return Response.json({ data: lesson }, { status: 201 });
			}
			return failure(405, "Use GET or POST");
		}

		const lesson = url.pathname.match(/^\/teammates\/lessons\/([\w-]+)$/);
		if (lesson) {
			if (request.method === "DELETE") {
				store.removeLesson(workspace, lesson[1]);
				return new Response(null, { status: 204 });
			}
			if (request.method === "PATCH") {
				const input = await body();
				const patch: { text?: string; state?: "kept" } = {};
				if (input.text !== undefined) {
					const text = lessonText(input.text);
					if (!text)
						return failure(400, `Write the lesson in one line, under ${LESSON_MAX} characters`);
					patch.text = text;
				}
				if (input.state === "kept") patch.state = "kept";
				const next = store.updateLesson(workspace, lesson[1], patch);
				return next ? Response.json({ data: next }) : failure(404, "That lesson is gone");
			}
			return failure(405, "Use PATCH or DELETE");
		}
	} catch (cause) {
		if (cause instanceof TeammateError) return failure(cause.status, cause.message);
		throw cause;
	}
	return failure(404, "Not found");
}

/**
 * `teammate_remember`, for a thread started as a teammate: the agent proposes a lesson when it is
 * corrected, and the person who gave the work sees it in their Inbox to keep or drop.
 */
export function rememberTool(deps: {
	store: TeammateStore;
	roles: Pick<RoleStore, "get">;
	inbox: { keep: (item: InboxDraft) => void };
}): GridTool {
	return {
		name: "teammate_remember",
		description:
			"Propose a lesson for yourself as this team's teammate: one short line about how to work that should hold next time too, usually after a person corrects you. A person approves it before it is kept.",
		inputSchema: {
			type: "object",
			properties: { lesson: { type: "string", description: "The lesson, in one short line" } },
			required: ["lesson"],
		},
		offered: (session) => Boolean(session.role),
		run: (session, args) => {
			const role = session.role ? deps.roles.get(session.workspaceId, session.role.id) : null;
			if (!role)
				return "This thread is not working as a teammate, so there is nobody to remember it.";
			const text = lessonText(args.lesson);
			if (!text) return `Give the lesson in one line, under ${LESSON_MAX} characters.`;
			const lesson = deps.store.addLesson(
				session.workspaceId,
				role.id,
				text,
				"proposed",
				session.id,
			);
			if (!lesson) return "That is already known, or there is no room for more lessons.";
			deps.inbox.keep({
				id: `lesson:${lesson.id}`,
				workspaceId: session.workspaceId,
				ownerId: session.ownerId,
				kind: "teammate",
				project: session.project,
				title: `${role.name} wants to remember`,
				body: text,
				url: `/team/${role.id}`,
				createdAt: lesson.createdAt,
			});
			return "Proposed. A person on the team approves it before it is kept.";
		},
	};
}
