import { appearance } from "./appearance";

let context: AudioContext | null = null;

/**
 * A soft two-note chime when something new needs the person (Settings → Appearance → Sounds). Made
 * with Web Audio, so there is no file to fetch; browsers keep it silent until the page has been
 * interacted with, which is when it matters anyway.
 */
export function playChime(): void {
	if (!appearance().sounds || typeof AudioContext === "undefined") return;
	try {
		context ??= new AudioContext();
		const start = context.currentTime;
		for (const [index, frequency] of [880, 1320].entries()) {
			const tone = context.createOscillator();
			const gain = context.createGain();
			tone.type = "sine";
			tone.frequency.value = frequency;
			const at = start + index * 0.12;
			gain.gain.setValueAtTime(0, at);
			gain.gain.linearRampToValueAtTime(0.08, at + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
			tone.connect(gain).connect(context.destination);
			tone.start(at);
			tone.stop(at + 0.55);
		}
	} catch {
		// No audio device, or the browser refused: a chime is never worth an error.
	}
}
