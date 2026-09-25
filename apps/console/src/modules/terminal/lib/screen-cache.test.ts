import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kept = new Map<string, unknown>();
vi.mock("@/lib/local-store", () => ({
	localStore: {
		get: async (key: string) => kept.get(key),
		set: async (key: string, value: unknown) => void kept.set(key, value),
		delete: async (key: string) => void kept.delete(key),
	},
	saveSoon: (key: string, value: () => unknown) => ({
		schedule: () => {},
		flush: () => kept.set(key, value()),
		cancel: () => {},
	}),
}));

const { forgetScreen, keptScreen, preloadScreens, screenRecorder } = await import("./screen-cache");

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array | undefined) => new TextDecoder().decode(data);

describe("terminal screens kept on the device", () => {
	beforeEach(() => kept.clear());
	afterEach(() => forgetScreen("t1"));

	it("keeps what arrives with the offset it starts at, and draws it back after a reload", async () => {
		const recorder = screenRecorder("t1");
		recorder.reset(100);
		recorder.add(bytes("hello "));
		recorder.add(bytes("world"));
		recorder.flush();
		expect(kept.get("terminal:t1")).toMatchObject({ at: 100 });

		forgetScreen("t1");
		kept.set("terminal:t1", { at: 100, bytes: bytes("hello world") });
		await preloadScreens(["t1"]);
		const screen = keptScreen("t1");
		expect(screen?.at).toBe(100);
		expect(text(screen?.bytes)).toBe("hello world");
	});

	it("drops the oldest output past the limit and moves its offset along", () => {
		const recorder = screenRecorder("t1");
		recorder.reset(0);
		const big = new Uint8Array(200 * 1024).fill(97);
		recorder.add(big);
		recorder.add(big);
		recorder.flush();
		const screen = keptScreen("t1");
		expect(screen?.bytes.byteLength).toBeLessThanOrEqual(256 * 1024);
		expect((screen?.at ?? 0) + (screen?.bytes.byteLength ?? 0)).toBe(400 * 1024);
	});

	it("forgets a closed terminal's screen", () => {
		const recorder = screenRecorder("t1");
		recorder.add(bytes("x"));
		recorder.flush();
		forgetScreen("t1");
		expect(keptScreen("t1")).toBeNull();
		expect(kept.has("terminal:t1")).toBe(false);
	});
});
