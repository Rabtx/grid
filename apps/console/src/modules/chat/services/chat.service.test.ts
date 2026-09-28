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

it("supports progress callbacks and abort with XMLHttpRequest", async () => {
	vi.stubGlobal("window", { location: { origin: "http://grid" } });

	class MockXHR {
		status = 201;
		responseText = JSON.stringify({
			data: { id: "f1", name: "test.png", size: 100, mimeType: "image/png" },
		});
		upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
		onload = null as (() => void) | null;
		onerror = null as (() => void) | null;
		headers: Record<string, string> = {};
		open = vi.fn();
		setRequestHeader = vi.fn((k: string, v: string) => {
			this.headers[k] = v;
		});
		abort = vi.fn();
		send = vi.fn(() => {
			if (this.upload.onprogress) {
				this.upload.onprogress({
					lengthComputable: true,
					loaded: 50,
					total: 100,
				} as ProgressEvent);
			}
			setTimeout(() => {
				this.onload?.();
			}, 0);
		});
	}

	vi.stubGlobal("XMLHttpRequest", MockXHR as unknown as typeof XMLHttpRequest);

	const progressUpdates: number[] = [];
	const file = new File(["data"], "test.png", { type: "image/png" });

	const result = await chatService.uploadOne("token", "sess-1", file, "", {
		onProgress: (pct) => progressUpdates.push(pct),
	});

	expect(result).toMatchObject({ id: "f1", name: "test.png" });
	expect(progressUpdates).toContain(50);
	expect(progressUpdates).toContain(100);

	// Test caching: a second upload of the same file returns cached result without sending again
	const cachedResult = await chatService.upload("token", "sess-1", [file]);
	expect(cachedResult).toEqual([result]);

	// The same file in another thread is uploaded there, not given this thread's attachment.
	const sends: string[] = [];
	class CountingXHR extends MockXHR {
		override open = vi.fn((_method: string, url: string) => {
			sends.push(url);
		});
	}
	vi.stubGlobal("XMLHttpRequest", CountingXHR as unknown as typeof XMLHttpRequest);
	await chatService.uploadOne("token", "sess-2", file, "");
	expect(sends).toHaveLength(1);
	expect(sends[0]).toContain("/chat/sessions/sess-2/");
});

it("cancels in-flight upload when aborted", async () => {
	vi.stubGlobal("window", { location: { origin: "http://grid" } });

	class MockXHR {
		upload = { onprogress: null };
		open = vi.fn();
		setRequestHeader = vi.fn();
		abort = vi.fn();
		send = vi.fn();
	}
	vi.stubGlobal("XMLHttpRequest", MockXHR as unknown as typeof XMLHttpRequest);

	const controller = new AbortController();
	controller.abort();

	const file = new File(["aborted"], "abort.txt");
	await expect(
		chatService.uploadOne("token", "sess-1", file, "", { signal: controller.signal }),
	).rejects.toThrow();
});
