export const TASK_STATUSES = [
	"backlog",
	"ready",
	"in_progress",
	"review",
	"qa",
	"blocked",
	"done",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskOwnerKind = "human" | "agent";

/** Column headings for the board, in workflow order. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
	backlog: "Backlog",
	ready: "Ready",
	in_progress: "In progress",
	review: "Review",
	qa: "QA",
	blocked: "Blocked",
	done: "Done",
};

export type Project = {
	slug: string;
	name: string;
	summary: string | null;
	repoUrl: string | null;
	/** How it is drawn: `folder` (the default), `letter`, `symbol:<id>` or `mascot:<id>`. */
	icon?: string | null;
	/** A palette colour id or `#rrggbb`; unset picks one from the project's name. */
	color?: string | null;
	status: "active" | "archived";
	createdAt: string;
	updatedAt: string;
};

export type CreateProjectInput = {
	slug: string;
	name: string;
	summary?: string | null;
	repoUrl?: string | null;
};

/** A rename, a new repository link, or archiving (which removes it from the console). */
export type UpdateProjectInput = {
	name?: string;
	summary?: string | null;
	repoUrl?: string | null;
	status?: "active" | "archived";
	icon?: string | null;
	color?: string | null;
};

export type Task = {
	key: string;
	number: number;
	title: string;
	description: string | null;
	status: TaskStatus;
	owner: { kind: TaskOwnerKind; name: string | null } | null;
	branch: string | null;
	position: number;
	createdAt: string;
	updatedAt: string;
};

export type CreateTaskInput = {
	title: string;
	description?: string | null;
	status?: TaskStatus;
	ownerKind?: TaskOwnerKind | null;
	ownerName?: string | null;
	branch?: string | null;
};

export type UpdateTaskInput = Partial<CreateTaskInput> & { position?: number };

/** The glyphs a note can wear in the list (the API keeps the same set). */
export const NOTE_ICONS = [
	"note",
	"flag",
	"layers",
	"rules",
	"check",
	"calendar",
	"bolt",
	"code",
	"globe",
	"shield",
] as const;
export type NoteIcon = (typeof NOTE_ICONS)[number];

/** Something kept on a project: a decision, a snippet, an agent's answer. Markdown. */
export type Note = {
	id: string;
	body: string;
	/** Where it was saved from, e.g. "Claude in Fix login". */
	source: string | null;
	/** The chat it came from. */
	threadId: string | null;
	/** Kept at the top of the list. */
	pinned: boolean;
	/** Given to agents: new threads in the project start with it. */
	shared: boolean;
	/** Its glyph; null for the plain note. */
	icon: NoteIcon | null;
	/** Who wrote it, and who last changed its text. */
	author: { name: string } | null;
	editor: { name: string } | null;
	createdAt: string;
	updatedAt: string;
};

/** What can change on a note: its text, and whether it is pinned, shared, and its glyph. */
export type NotePatch = Partial<Pick<Note, "body" | "pinned" | "shared" | "icon">>;

export type CreateNoteInput = {
	body: string;
	source?: string | null;
	threadId?: string | null;
} & Omit<NotePatch, "body">;
