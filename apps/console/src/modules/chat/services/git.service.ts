import { runnerCall } from "@/lib/runner-client";

import type { ChatSession, WorktreeStatus } from "../types/chat.types";

/** A folder's git state, as the composer's git control shows it (apps/runner/src/folders/git.ts). */
export type GitInfo = {
	repo: boolean;
	branch: string | null;
	branches: string[];
	changed: number;
	worktree: boolean;
};

/** One worktree in Settings → Worktrees: how it stands, and the thread using it, if any. */
export type WorktreeEntry = WorktreeStatus & {
	project: string;
	chat: { id: string; title: string } | null;
};

/** Git on the machine a project runs on: `scope` is its runner (`/env/<id>`, or "" for this one). */
export const gitService = {
	info: (token: string, path: string, scope = "") =>
		runnerCall<GitInfo>(`${scope}/fs/git?path=${encodeURIComponent(path)}`, token),
	/** Switch the folder to a branch, or create it from what is checked out (`create`). */
	checkout: (token: string, path: string, branch: string, create: boolean, scope = "") =>
		runnerCall<GitInfo>(`${scope}/fs/git/checkout`, token, {
			method: "POST",
			body: JSON.stringify({ path, branch, create }),
		}),
	worktrees: (token: string, scope = "") =>
		runnerCall<WorktreeEntry[]>(`${scope}/chat/worktrees`, token),
	removeWorktree: (
		token: string,
		path: string,
		options: { deleteBranch: boolean; force?: boolean },
		scope = "",
	) =>
		runnerCall<void>(`${scope}/chat/worktrees/remove`, token, {
			method: "POST",
			body: JSON.stringify({ path, ...options }),
		}),
	/** Remove every worktree that holds nothing; says how many went. */
	cleanWorktrees: (token: string, scope = "") =>
		runnerCall<{ removed: number }>(`${scope}/chat/worktrees/clean`, token, { method: "POST" }),
};

/** Where a thread works, for the git control: its folder, and its worktree when it has one. */
export type GitPlace = Pick<ChatSession, "cwd" | "worktree">;
