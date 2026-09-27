import { describe, expect, it } from "bun:test";

import type { Who } from "../auth";
import { DiagnosticJournal } from "./journal";
import { DiagnosticRoutes } from "./routes";

const who: Who = { userId: "user-a", workspace: "workspace-a" };

function createRoutes(now: () => number = Date.now) {
	const journal = new DiagnosticJournal(":memory:", now);
	return { journal, routes: new DiagnosticRoutes(journal, now) };
}

describe("DiagnosticRoutes", () => {
	it("validates and stores only allowlisted client fields", async () => {
		const { journal, routes } = createRoutes();
		const now = Date.now();
		const response = await routes.handle(
			new Request("http://runner/diagnostics/client", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					events: [
						{
							event: "close",
							source: "chat",
							sessionId: "session_1",
							code: 1006,
							reason: "the transcript and token=secret",
							durationMs: 4200,
							online: false,
							visibility: "hidden",
							clientAt: now,
							version: "0.1.0",
							message: "private transcript",
							token: "secret-token",
							file: "private-file-content",
						},
					],
				}),
			}),
			new URL("http://runner/diagnostics/client"),
			who,
		);
		const event = journal.list(who.workspace, { since: 0 })[0];
		expect(response?.status).toBe(204);
		expect(event.details).toMatchObject({
			event: "close",
			sessionId: "session_1",
			code: 1006,
			reason: "Unrecognized close reason omitted",
			durationMs: 4200,
		});
		expect(JSON.stringify(event)).not.toContain("private transcript");
		expect(JSON.stringify(event)).not.toContain("secret-token");
		expect(JSON.stringify(event)).not.toContain("private-file-content");
		journal.close();
	});

	it("rejects malformed events, invalid filters, and excessive batches", async () => {
		const { journal, routes } = createRoutes();
		const malformed = await routes.handle(
			new Request("http://runner/diagnostics/client", {
				method: "POST",
				body: JSON.stringify({ events: [{ event: "close", source: "chat" }] }),
			}),
			new URL("http://runner/diagnostics/client"),
			who,
		);
		const filter = await routes.handle(
			new Request("http://runner/diagnostics?kind=invalid"),
			new URL("http://runner/diagnostics?kind=invalid"),
			who,
		);
		const batch = await routes.handle(
			new Request("http://runner/diagnostics/client", {
				method: "POST",
				body: JSON.stringify({ events: Array.from({ length: 26 }, () => ({})) }),
			}),
			new URL("http://runner/diagnostics/client"),
			who,
		);
		expect(malformed?.status).toBe(400);
		expect(filter?.status).toBe(400);
		expect(batch?.status).toBe(400);
		journal.close();
	});

	it("limits client reports to 30 batches per user each minute", async () => {
		let now = Date.now();
		const { journal, routes } = createRoutes(() => now);
		const request = () =>
			new Request("http://runner/diagnostics/client", {
				method: "POST",
				body: JSON.stringify({
					events: [
						{
							event: "reconnect",
							source: "link",
							online: true,
							visibility: "visible",
							clientAt: now,
							version: "0.1.0",
						},
					],
				}),
			});
		let last: Response | null = null;
		for (let attempt = 0; attempt < 31; attempt++) {
			last = await routes.handle(request(), new URL("http://runner/diagnostics/client"), who);
		}
		expect(last?.status).toBe(429);
		now += 60_001;
		const recovered = await routes.handle(
			request(),
			new URL("http://runner/diagnostics/client"),
			who,
		);
		expect(recovered?.status).toBe(204);
		expect(journal.reconnectCount(who.workspace, now - 24 * 60 * 60 * 1000)).toBe(31);
		journal.close();
	});
});
