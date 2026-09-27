/** Which kind of wait an inbox item is, which decides how the row reads and its icon. */
export type InboxKind = "approval" | "turn_done" | "turn_error" | "pull_review" | "pull_checks";

/** One thing waiting on a person, across every project. */
export type InboxItem = {
	/** Stable per event, so the same thing arriving twice is one row. */
	id: string;
	kind: InboxKind;
	project: string;
	/** The thread's or pull request's own name, so a row is recognisable on its own. */
	title: string;
	/** The line under it: what is waiting, or what went wrong. */
	body: string;
	/** Where the row goes: a chat, or a project's pull requests. */
	url: string;
	createdAt: string;
	readAt: string | null;
};

/** What the page reads in one go. */
export type InboxView = {
	items: InboxItem[];
	unread: number;
	/** Whether GitHub answered: false is a hint to connect it, not a failure. */
	github: boolean;
};
