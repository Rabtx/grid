import { afterEach, expect, it, vi } from "vitest";
import { chatService } from "./chat.service";

afterEach(() => vi.unstubAllGlobals());

it("uploads to the project's machine before returning ids, preserving names without custom headers", async () => {
	vi.stubGlobal("window", { location: { origin: "http://grid" } });
	const fetcher = vi.fn().mockResolvedValue(
		new Response(
			JSON.stringify({
				data: { id: "file", name: "a b.txt", size: 2, mimeType: "application/octet-stream" },
			}),
		),
	);
	vi.stubGlobal("fetch", fetcher);
	const file = new File(["ok"], "a b.txt");
	expect(await chatService.upload("token", "thread", [file], "/env/remote")).toEqual([
		expect.objectContaining({ id: "file" }),
	]);
	expect(fetcher).toHaveBeenCalledWith(
		"http://grid/runner/env/remote/chat/sessions/thread/attachments?name=a%20b.txt",
		expect.objectContaining({
			method: "POST",
			body: file,
			headers: expect.objectContaining({ Authorization: "Bearer token" }),
		}),
	);
});

it("surfaces upload failures and rejects oversized batches before fetching", async () => {
	vi.stubGlobal("window", { location: { origin: "http://grid" } });
	const fetcher = vi
		.fn()
		.mockResolvedValue(new Response(JSON.stringify({ message: "Disk full" }), { status: 507 }));
	vi.stubGlobal("fetch", fetcher);
	await expect(
		chatService.upload("token", "thread", [new File(["ok"], "file.txt")]),
	).rejects.toThrow("Disk full");
	fetcher.mockClear();
	await expect(
		chatService.upload(
			"token",
			"thread",
			Array.from({ length: 21 }, () => new File([], "f")),
		),
	).rejects.toThrow("20 files");
	expect(fetcher).not.toHaveBeenCalled();
});
