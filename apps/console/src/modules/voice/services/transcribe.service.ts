import { DictationError } from "../lib/speech-engines";

/** Send a recording to the runner (same origin, `/runner`) and get the words back. */
export async function transcribeWithRunner(token: string, audio: Blob): Promise<string> {
	let response: Response;
	try {
		response = await fetch(`${window.location.origin}/runner/transcribe`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": audio.type || "audio/webm" },
			body: audio,
		});
	} catch {
		throw new DictationError(
			"The runner is not reachable, so the recording could not be transcribed.",
		);
	}
	const body = (await response.json().catch(() => null)) as {
		data?: { text?: string };
		message?: string;
	} | null;
	if (!response.ok) {
		throw new DictationError(body?.message ?? `Transcription failed (${response.status})`);
	}
	return body?.data?.text ?? "";
}
