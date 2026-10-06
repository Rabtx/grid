import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStorage } from "./account-storage";
import { localStore } from "./local-store";
const workspace = vi.hoisted(() => ({ slug: "demo" }));
vi.mock("./active-workspace", () => ({ activeWorkspace: () => workspace.slug }));
beforeEach(() => {
	workspace.slug = "demo";
	localStorage.clear();
	localStore.setUser("first");
});
afterEach(() => {
	localStore.setUser(null);
	localStorage.clear();
});
describe("private route memories", () => {
	it("does not show another account's same-project paths or chat IDs", () => {
		for (const key of ["grid.files.tabs.alpha", "grid.chat.tabs.alpha", "grid.chat.last.alpha"]) {
			accountStorage.set(key, "private-first-account");
			localStore.setUser("second");
			expect(accountStorage.get(key)).toBeNull();
			accountStorage.set(key, "second-account");
			localStore.setUser("first");
			expect(accountStorage.get(key)).toBe("private-first-account");
		}
	});
	it("keeps same-slug projects in different workspaces separate", () => {
		accountStorage.set("grid.files.tabs.alpha", "private-path");
		workspace.slug = "another";
		expect(accountStorage.get("grid.files.tabs.alpha")).toBeNull();
	});
	it("ignores global legacy keys and does not read or write while signed out", () => {
		localStorage.setItem("grid.files.tabs.alpha", "legacy-private-path");
		expect(accountStorage.get("grid.files.tabs.alpha")).toBeNull();
		localStore.setUser(null);
		accountStorage.set("grid.files.tabs.alpha", "signed-out");
		expect(accountStorage.get("grid.files.tabs.alpha")).toBeNull();
		expect(localStorage.getItem("grid.files.tabs.alpha")).toBe("legacy-private-path");
	});
});
