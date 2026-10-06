import { afterEach, describe, expect, it, vi } from "vitest";
const { localStore, saveSoon } = await import("./local-store");
afterEach(() => {
	localStore.setUser(null);
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
describe("account cache lifecycle", () => {
	it("drops a write waiting for IndexedDB when its account has signed out", async () => {
		const put = vi.fn();
		const opening = {
			result: { transaction: () => ({ objectStore: () => ({ put }) }) },
			onsuccess: null as (() => void) | null,
		};
		vi.stubGlobal("indexedDB", { open: () => opening });
		localStore.setUser("first");
		const writing = localStore.set("notes:alpha", ["private"]);
		localStore.setUser("second");
		opening.onsuccess!();
		await writing;
		expect(put).not.toHaveBeenCalled();
	});
	it("does not evaluate or persist a delayed value for the next signed-in account", async () => {
		vi.useFakeTimers();
		localStore.setUser("first");
		const privateValue = vi.fn(() => "private transcript");
		const saving = saveSoon("conversation", privateValue);
		saving.schedule();
		localStore.setUser("second");
		await vi.advanceTimersByTimeAsync(1000);
		expect(privateValue).not.toHaveBeenCalled();
	});
});
