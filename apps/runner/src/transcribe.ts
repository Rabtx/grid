import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Speech to text on the machine, for browsers without a recogniser of their own. Provider-
 * agnostic: point it at any OpenAI-compatible `/audio/transcriptions` endpoint (a hosted API or
 * a local server), or at a command (whisper.cpp and friends). Nothing is configured by default.
 */
export type TranscribeConfig =
	| { kind: "none" }
	| { kind: "api"; url: string; apiKey: string | null; model: string; language: string | null }
	| { kind: "command"; command: string };

export function readTranscribeConfig(env: Record<string, string | undefined>): TranscribeConfig {
	if (env.RUNNER_STT_COMMAND) return { kind: "command", command: env.RUNNER_STT_COMMAND };
	if (env.RUNNER_STT_URL) {
		return {
			kind: "api",
			url: env.RUNNER_STT_URL,
			apiKey: env.RUNNER_STT_API_KEY ?? null,
			model: env.RUNNER_STT_MODEL ?? "whisper-1",
			language: env.RUNNER_STT_LANGUAGE ?? null,
		};
	}
	return { kind: "none" };
}

/** Why a transcription failed, with the status the HTTP answer should carry. */
export class TranscribeError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "TranscribeError";
	}
}

const EXTENSIONS: Record<string, string> = {
	"audio/webm": "webm",
	"audio/ogg": "ogg",
	"audio/mp4": "m4a",
	"audio/mpeg": "mp3",
	"audio/wav": "wav",
};

function extensionFor(type: string): string {
	return EXTENSIONS[type.split(";")[0].trim()] ?? "webm";
}

export async function transcribe(
	config: TranscribeConfig,
	audio: Blob,
	fetcher: typeof fetch = fetch,
): Promise<string> {
	if (config.kind === "none") {
		throw new TranscribeError(
			"Voice input needs a speech engine on this machine. Set RUNNER_STT_URL (any OpenAI-compatible transcription API) or RUNNER_STT_COMMAND for the runner.",
			501,
		);
	}
	if (config.kind === "api") return transcribeWithApi(config, audio, fetcher);
	return transcribeWithCommand(config.command, audio);
}

async function transcribeWithApi(
	config: Extract<TranscribeConfig, { kind: "api" }>,
	audio: Blob,
	fetcher: typeof fetch,
): Promise<string> {
	const form = new FormData();
	form.append("file", audio, `speech.${extensionFor(audio.type)}`);
	form.append("model", config.model);
	form.append("response_format", "json");
	if (config.language) form.append("language", config.language);
	let response: Response;
	try {
		response = await fetcher(config.url, {
			method: "POST",
			headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
			body: form,
		});
	} catch (cause) {
		console.error("[runner] speech engine unreachable", cause);
		throw new TranscribeError("The speech engine is not reachable.", 502);
	}
	const body = (await response.json().catch(() => null)) as {
		text?: unknown;
		error?: { message?: string };
	} | null;
	if (!response.ok || typeof body?.text !== "string") {
		throw new TranscribeError(
			body?.error?.message ?? `The speech engine answered ${response.status}.`,
			502,
		);
	}
	return body.text;
}

/**
 * Run the configured command with `{input}` replaced by the recording's path (in a fresh temp
 * directory); whatever it prints is the text. Run through the shell so pipelines work, e.g.
 * `ffmpeg -loglevel error -i {input} -ar 16000 -ac 1 -f wav - | whisper-cli -m model.bin -nt -f -`.
 */
async function transcribeWithCommand(command: string, audio: Blob): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "grid-stt-"));
	const input = join(dir, `speech.${extensionFor(audio.type)}`);
	try {
		await writeFile(input, new Uint8Array(await audio.arrayBuffer()));
		const proc = Bun.spawn(["sh", "-c", command.replaceAll("{input}", `'${input}'`)], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [text, errors, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		if (code !== 0) {
			console.error("[runner] speech command failed", code, errors.slice(-500));
			throw new TranscribeError(`The speech command failed (exit ${code}).`, 502);
		}
		return text.replace(/\s+/g, " ").trim();
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
