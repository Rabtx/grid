import { describe, expect, it } from "bun:test";

import { readTranscribeConfig, transcribe, TranscribeError } from "./transcribe";

const clip = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm;codecs=opus" });

describe("readTranscribeConfig", () => {
	it("is off until an engine is configured, and a command wins over a URL", () => {
		expect(readTranscribeConfig({}).kind).toBe("none");
		expect(readTranscribeConfig({ RUNNER_STT_URL: "http://x/v1/audio/transcriptions" }).kind).toBe(
			"api",
		);
		expect(
			readTranscribeConfig({ RUNNER_STT_URL: "http://x", RUNNER_STT_COMMAND: "cat" }).kind,
		).toBe("command");
	});
});

describe("transcribe", () => {
	it("explains how to set an engine up when none is configured", async () => {
		const failure = await transcribe({ kind: "none" }, clip).catch((cause: unknown) => cause);
		expect(failure).toBeInstanceOf(TranscribeError);
		expect((failure as TranscribeError).status).toBe(501);
		expect((failure as Error).message).toContain("RUNNER_STT_URL");
	});

	it("posts the clip to an OpenAI-compatible endpoint and returns its text", async () => {
		const seen: { auth: string | null; model: unknown; file: unknown }[] = [];
		const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
			const form = init?.body as FormData;
			seen.push({
				auth: new Headers(init?.headers).get("authorization"),
				model: form.get("model"),
				file: (form.get("file") as File).name,
			});
			return Response.json({ text: "list the files" });
		}) as typeof fetch;
		const text = await transcribe(
			{
				kind: "api",
				url: "http://stt/v1/audio/transcriptions",
				apiKey: "k",
				model: "m",
				language: null,
			},
			clip,
			fetcher,
		);
		expect(text).toBe("list the files");
		expect(seen).toEqual([{ auth: "Bearer k", model: "m", file: "speech.webm" }]);
	});

	it("runs a local command on the recording and returns what it prints", async () => {
		// `wc -c` stands in for a speech engine: it reads the file and prints something.
		const text = await transcribe(
			{ kind: "command", command: "echo heard $(wc -c < {input}) bytes" },
			clip,
		);
		expect(text).toBe("heard 3 bytes");
	});

	it("reports a failing command", async () => {
		const failure = await transcribe({ kind: "command", command: "exit 3" }, clip).catch(
			(cause: unknown) => cause,
		);
		expect((failure as TranscribeError).status).toBe(502);
	});
});
