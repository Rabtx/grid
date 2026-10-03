import type { PersonPrefs } from "../services/account.service";

/** The runner's defaults for a person's settings, for tests. */
export const DEFAULT_TEST_PREFS: PersonPrefs = {
	git: { name: null, email: null, creditAgent: true, signCommits: false },
	notify: {
		channels: {
			approvals: { desktop: true, phone: true, email: false },
			questions: { desktop: true, phone: true, email: false },
			runs: { desktop: true, phone: false, email: false },
			reviews: { desktop: true, phone: true, email: true },
			following: { desktop: false, phone: false, email: true },
		},
		quiet: {
			on: false,
			from: "22:00",
			to: "08:00",
			timezone: "UTC",
			approvalsThrough: true,
			weekends: false,
		},
		lockScreen: true,
		digest: false,
	},
};
