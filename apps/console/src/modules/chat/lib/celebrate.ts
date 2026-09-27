import { hueOf, playArrival } from "@/kit";
import { appearance } from "@/lib/appearance";

import { shortModelName } from "./choices";

/**
 * The models worth a celebration: each lab's current flagship tier, not its small or fast ones.
 * Matched on the name and id together, since agents report them differently.
 */
const FLAGSHIP: readonly RegExp[] = [
	/\bopus\b/i,
	/\bastra\b/i,
	/\bgpt-?5(?:\.\d+)?\b(?!.*\b(?:mini|nano|codex-mini)\b)/i,
	/\bgemini\b.*\b(?:pro|ultra)\b/i,
	/\bgrok[- ]?4\b(?!.*\bfast\b)/i,
];

export function isFlagship(model: { id: string; name: string }): boolean {
	const text = `${model.name} ${model.id}`;
	return FLAGSHIP.some((pattern) => pattern.test(text));
}

/** Where a celebration plays: a desktop pointer, a wide screen, and motion allowed. */
function canCelebrate(): boolean {
	if (typeof matchMedia === "undefined") return false;
	return (
		appearance().celebrations &&
		matchMedia("(pointer: fine) and (min-width: 48rem)").matches &&
		!matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/** A lab's colours for the celebration: two hues, and how saturated. */
export type LabLook = { lab: string; hues: readonly [number, number]; saturation?: number };

const LABS: readonly (LabLook & { match: RegExp })[] = [
	{
		lab: "Anthropic",
		match: /\b(opus|sonnet|haiku|claude|anthropic)\b/i,
		hues: [16, 34],
		saturation: 85,
	},
	{ lab: "OpenAI", match: /\b(gpt|astra|openai|codex)/i, hues: [158, 196], saturation: 72 },
	{ lab: "Google", match: /\b(gemini|google)\b/i, hues: [214, 282] },
	{ lab: "xAI", match: /\b(grok|xai)\b/i, hues: [205, 230], saturation: 18 },
];

/** Which lab a model is from, by its name, id and group, for its colours and its caption. */
export function labOf(model: { id: string; name: string; group?: string }): LabLook {
	const text = `${model.name} ${model.id} ${model.group ?? ""}`;
	const found = LABS.find((entry) => entry.match.test(text));
	if (found) return { lab: found.lab, hues: found.hues, saturation: found.saturation };
	const hue = hueOf(model.group || model.name);
	return { lab: model.group || "", hues: [hue, (hue + 50) % 360] };
}

/**
 * Picking a flagship: the warp arrival, in the lab's colours, with the model's short name.
 * Anything else, or a phone, or reduced motion, or celebrations turned off: nothing.
 */
export function celebrateModel(model: { id: string; name: string; group?: string }): void {
	if (!isFlagship(model) || !canCelebrate()) return;
	const look = labOf(model);
	playArrival({
		title: shortModelName(model.name),
		caption: look.lab ? `Flagship model · ${look.lab}` : "Flagship model",
		hues: look.hues,
		saturation: look.saturation,
	});
}
