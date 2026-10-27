import { describe, expect, it } from "vitest";

import { actionWords } from "./audit-words";

describe("audit actions in words", () => {
	it("reads each kind of action as the start of a sentence, and an unknown one as it is", () => {
		expect(actionWords("thread.start")).toBe("Started");
		expect(actionWords("key.revoke")).toBe("Revoked the agent key");
		expect(actionWords("something.new")).toBe("something.new");
	});
});
