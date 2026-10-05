import type { JSX } from "@solidjs/web";

import { AlertIcon, CheckIcon, CloseIcon, type FeedTone, PullRequestIcon, ShieldIcon } from "@/kit";

import type { InboxKind } from "../types/inbox.types";

/** How each kind reads: its tinted glyph, what it is waiting on, and where it opens. */
export const KINDS: Record<
	InboxKind,
	{ tone: FeedTone; icon: () => JSX.Element; state: string; open: string }
> = {
	incident_open: {
		tone: "danger",
		icon: () => <AlertIcon />,
		state: "Service outage",
		open: "Open Operate",
	},
	incident_resolved: {
		tone: "success",
		icon: () => <CheckIcon />,
		state: "Service recovered",
		open: "Open Operate",
	},
	approval: {
		tone: "violet",
		icon: () => <ShieldIcon />,
		state: "Waiting for your approval",
		open: "Open thread",
	},
	turn_done: {
		tone: "success",
		icon: () => <CheckIcon />,
		state: "Finished while you were away",
		open: "Open thread",
	},
	turn_error: {
		tone: "danger",
		icon: () => <CloseIcon />,
		state: "The run failed",
		open: "Open thread",
	},
	pull_review: {
		tone: "accent",
		icon: () => <PullRequestIcon />,
		state: "Wants your review",
		open: "Open pull request",
	},
	pull_checks: {
		tone: "danger",
		icon: () => <AlertIcon />,
		state: "Checks are failing",
		open: "Open pull request",
	},
};
