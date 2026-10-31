import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { localStore } from "@/lib/local-store";

import { composerDrafts } from "./composer-drafts";

describe("composerDrafts", () => {
	beforeEach(() => {
		localStorage.clear();
		localStore.setUser("u1");
	});
	afterEach(() => {
		localStore.setUser(null);
		localStorage.clear();
	});

	it("keeps a composer's text, and forgets it when emptied", () => {
		composerDrafts.save("thread:a", "half a thought");
		expect(composerDrafts.read("thread:a")).toBe("half a thought");
		expect(composerDrafts.read("thread:b")).toBe("");
		composerDrafts.save("thread:a", "   ");
		expect(composerDrafts.read("thread:a")).toBe("");
		composerDrafts.save("thread:a", "again");
		composerDrafts.clear("thread:a");
		expect(composerDrafts.read("thread:a")).toBe("");
	});

	it("keeps drafts per account, and nothing while signed out", () => {
		composerDrafts.save("new:alpha", "mine");
		localStore.setUser("u2");
		expect(composerDrafts.read("new:alpha")).toBe("");
		localStore.setUser(null);
		composerDrafts.save("new:alpha", "nobody's");
		localStore.setUser("u1");
		expect(composerDrafts.read("new:alpha")).toBe("mine");
	});

	it("keeps the newest fifty", () => {
		for (let i = 0; i < 55; i++) composerDrafts.save(`thread:${i}`, `draft ${i}`);
		expect(composerDrafts.read("thread:0")).toBe("");
		expect(composerDrafts.read("thread:54")).toBe("draft 54");
	});
});
