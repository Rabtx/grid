// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { reportClientDiagnostic, reportRunnerSuccess } from "@/lib/runner-health";

describe("client diagnostics reporting", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("batches events and includes safe connection metadata and app version", async () => {
		vi.useFakeTimers();
		Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
		const fetcher = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
		);
		vi.stubGlobal("fetch", fetcher);
		const token = () => "access-token";
		reportClientDiagnostic("wss://grid.example/runner/chat", token, {
			event: "close",
			source: "chat",
			sessionId: "session-1",
			code: 1006,
			reason: "private message text",
			durationMs: 3210,
		});
		reportClientDiagnostic("wss://grid.example/runner/chat", token, {
			event: "reconnect",
			source: "chat",
			sessionId: "session-1",
			attempt: 1,
		});

		await vi.advanceTimersByTimeAsync(300);

		expect(fetcher).toHaveBeenCalledTimes(1);
		const [endpoint, request] = fetcher.mock.calls[0] ?? [];
		const body = JSON.parse(String(request?.body)) as { events: Record<string, unknown>[] };
		expect(endpoint?.toString()).toBe("https://grid.example/runner/diagnostics/client");
		expect(body.events).toHaveLength(2);
		expect(body.events[0]).toMatchObject({
			event: "close",
			sessionId: "session-1",
			code: 1006,
			reason: "Unrecognized close reason omitted",
			durationMs: 3210,
		});
		expect(body.events[0].version).toBe("0.1.0");
		expect(JSON.stringify(body)).not.toContain("private message text");
	});

	it("holds events while offline and sends them once the browser comes online", async () => {
		vi.useFakeTimers();
		Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
		const fetcher = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
		);
		vi.stubGlobal("fetch", fetcher);
		reportClientDiagnostic("https://grid.example/runner", () => "access-token", {
			event: "fallback",
			source: "terminal",
			sessionId: "term-1",
		});
		await vi.advanceTimersByTimeAsync(500);
		expect(fetcher).not.toHaveBeenCalled();

		Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
		window.dispatchEvent(new Event("online"));
		await Promise.resolve();

		expect(
			fetcher.mock.calls.filter(
				([input, init]) =>
					input.toString().endsWith("/diagnostics/client") && init?.method === "POST",
			),
		).toHaveLength(1);
	});

	it("keeps a failed online batch and sends it once when the runner next answers", async () => {
		vi.useFakeTimers();
		Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
		const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
			throw new Error("network failure");
		});
		vi.stubGlobal("fetch", fetcher);
		reportClientDiagnostic("https://grid.example/runner", () => "access-token", {
			event: "reconnect",
			source: "link",
			attempt: 2,
		});
		await vi.advanceTimersByTimeAsync(300);
		await vi.advanceTimersByTimeAsync(10_000);
		// No retry loop while the runner stays unreachable.
		expect(fetcher).toHaveBeenCalledTimes(1);

		const sent = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
		);
		vi.stubGlobal("fetch", sent);
		reportRunnerSuccess();
		await vi.advanceTimersByTimeAsync(300);
		expect(sent).toHaveBeenCalledTimes(1);
		const body = JSON.parse(String(sent.mock.calls[0]?.[1]?.body)) as {
			events: { event: string; attempt: number }[];
		};
		expect(body.events).toMatchObject([{ event: "reconnect", attempt: 2 }]);

		reportRunnerSuccess();
		await vi.advanceTimersByTimeAsync(300);
		expect(sent).toHaveBeenCalledTimes(1);
	});
});
