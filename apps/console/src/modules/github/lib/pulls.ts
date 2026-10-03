import type { PullDetail } from "../types/github.types";

/** What merging needs first, or null when it can merge now. */
export function mergeBlocker(pull: PullDetail): string | null {
	if (pull.state !== "OPEN") return "It is not open";
	if (pull.draft) return "Mark it ready for review first";
	if (pull.mergeable === "CONFLICTING") return "It has conflicts with its base branch";
	return null;
}
