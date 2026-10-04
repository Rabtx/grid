import { describe, expect, it } from "bun:test";

import { answerFor, branchNote, capabilityOf, DEFAULT_POLICY, policyOf } from "./policy";

const options = [
	{ id: "yes", label: "Allow", kind: "allow" as const },
	{ id: "always", label: "Always", kind: "allow_always" as const },
	{ id: "no", label: "Deny", kind: "deny" as const },
];

describe("agent policy", () => {
	it("tells what kind of action a request is", () => {
		expect(capabilityOf("Run git push origin feature")).toBe("push");
		expect(capabilityOf("bun add zod", "execute")).toBe("packages");
		expect(capabilityOf("pip install requests", "execute")).toBe("packages");
		expect(capabilityOf("curl https://example.com", "execute")).toBe("network");
		expect(capabilityOf("Fetch the docs", "fetch")).toBe("network");
		expect(capabilityOf("bun test", "execute")).toBe("commands");
		expect(capabilityOf("Edit src/app.ts", "edit")).toBe("edit");
		expect(capabilityOf("Read README.md", "read")).toBe("read");
		expect(capabilityOf("Write the config")).toBe("edit");
	});
	it("answers for the person where the workspace decided, and leaves the rest", () => {
		const policy = policyOf({
			agentPolicy: { rules: { commands: "allow", push: "never", edit: "ask" } },
		});
		expect(answerFor(policy, { title: "bun test", options }, "execute")).toBe("yes");
		expect(answerFor(policy, { title: "git push origin x", options }, "execute")).toBe("no");
		expect(answerFor(policy, { title: "Edit a.ts", options }, "edit")).toBeNull();
		expect(answerFor(DEFAULT_POLICY, { title: "Read a.ts", options }, "read")).toBe("yes");
		expect(answerFor(DEFAULT_POLICY, { title: "bun test", options }, "execute")).toBeNull();
	});
	it("keeps pushes off the default branch and shows every command when asked", () => {
		const policy = policyOf({
			agentPolicy: {
				rules: { push: "allow", commands: "allow" },
				newBranch: true,
				showCommands: true,
			},
		});
		expect(answerFor(policy, { title: "git push origin main", options }, "execute", "main")).toBe(
			"no",
		);
		expect(
			answerFor(policy, { title: "git push origin HEAD:main", options }, "execute", "main"),
		).toBe("no");
		expect(
			answerFor(policy, { title: "git push origin fix-eta", options }, "execute", "main"),
		).toBeNull();
		expect(answerFor(policy, { title: "bun test", options }, "execute")).toBeNull();
		expect(branchNote(policy, "trunk")).toContain("Never commit straight to trunk");
		expect(branchNote(DEFAULT_POLICY)).toBeNull();
	});
});
