/**
 * A stand-in for the `gh` CLI in the sign-in test: it prints a line whose non-ASCII characters
 * are deliberately split across two writes, the way a real process's output lands in chunks that
 * do not line up with characters. FAKE_GH_TEXT says what to print.
 *
 * The device code and the paste-back token this carries are typed by hand, so a character the
 * runner mangles is a code the person cannot enter.
 */
const args = process.argv.slice(2);
if (args[0] === "pr" && args[1] === "list") {
	const stateIndex = args.indexOf("--state");
	const state = stateIndex !== -1 ? args[stateIndex + 1] : "open";
	const jsonIndex = args.indexOf("--json");
	const fields = jsonIndex !== -1 ? args[jsonIndex + 1] : "";
	const limitIndex = args.indexOf("--limit");
	const limit = limitIndex !== -1 ? Number(args[limitIndex + 1]) || 100 : 100;

	// When listing merged/closed pull requests, querying statusCheckRollup times out / fails
	// on repositories with many pull requests because GitHub must resolve commit statuses across
	// all items.
	if (state !== "open" && fields.includes("statusCheckRollup")) {
		process.stderr.write(
			"GraphQL: Query complexity exceeded or request timed out resolving statusCheckRollup\n",
		);
		process.exit(1);
	}

	const samplePull = {
		number: 180,
		title: "Fix bug in runner",
		author: { login: "ana" },
		headRefName: "fix-runner",
		baseRefName: "main",
		isDraft: false,
		reviewDecision: "APPROVED",
		statusCheckRollup:
			state === "open"
				? [{ __typename: "CheckRun", name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }]
				: null,
		labels: [{ name: "bug" }],
		additions: 12,
		deletions: 3,
		createdAt: "2026-10-06T10:00:00Z",
		updatedAt: "2026-10-06T12:00:00Z",
		headRefOid: "def456",
		url: "https://github.com/acme/app/pull/180",
		body: "Fixes the issue.",
	};

	const count = Math.min(limit, 2);
	const items = Array.from({ length: count }, (_, i) => ({
		...samplePull,
		number: 180 - i,
		title: `Pull request #${180 - i}`,
	}));

	process.stdout.write(JSON.stringify(items));
	process.exit(0);
}

const text = process.env.FAKE_GH_TEXT ?? "";
const bytes = new TextEncoder().encode(text);
// Cut one byte into the first multi-byte character, which is the case a per-chunk decode gets
// wrong: the first read ends holding half of it.
const lead = [...bytes].findIndex((byte) => byte >= 0xc0);
const at = lead >= 0 ? lead + 1 : Math.max(1, bytes.length - 1);
process.stdout.write(bytes.slice(0, at));
setTimeout(() => {
	process.stdout.write(bytes.slice(at));
	process.exit(0);
}, 20);
