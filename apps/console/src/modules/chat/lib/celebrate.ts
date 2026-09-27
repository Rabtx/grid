import { hueOf, igniteGrid } from "@/kit";
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

/**
 * Picking a flagship lights the grid from where you clicked, in the provider's colour, spelling
 * the model's short name. Anything else, or a phone, or reduced motion: nothing.
 */
export function celebrateModel(
	model: { id: string; name: string; group?: string },
	from: { x: number; y: number },
): void {
	if (!isFlagship(model) || !canCelebrate()) return;
	igniteGrid({
		x: from.x,
		y: from.y,
		label: shortModelName(model.name).toUpperCase(),
		hue: hueOf(model.group || model.name),
	});
}
