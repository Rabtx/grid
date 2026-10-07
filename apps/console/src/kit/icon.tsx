/**
 * The renderer every named icon uses. Each icon lives in its own module (`glyphs/`), so a screen
 * loads the icons it draws and the first load carries only the shell's.
 */
import type { JSX } from "@solidjs/web";

/** An icon from `@hugeicons/core-free-icons`: a list of `[tag, attributes]` SVG children. */
export type IconData = readonly (readonly [string, { readonly [key: string]: string | number }])[];

// The console draws every glyph at one light stroke weight, like the rest of the product chrome.
const STROKE_WIDTH = 1.5;

function kebab(name: string): string {
	return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function escape(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Serialise icon data to SVG markup. The data is static and comes from the icon package, never
 * from users, so writing it as markup is safe and avoids a per-node renderer.
 */
function markup(icon: IconData, strokeWidth: number): string {
	return icon
		.map(([tag, attrs]) => {
			const attributes = Object.entries(attrs)
				.filter(([name]) => name !== "key")
				.map(([name, value]) =>
					name === "strokeWidth"
						? `stroke-width="${strokeWidth}"`
						: `${kebab(name)}="${escape(String(value))}"`,
				)
				.join(" ");
			return `<${tag} ${attributes}/>`;
		})
		.join("");
}

/**
 * Renders a Hugeicons glyph in `currentColor`, so it takes its label's ink. Decorative: the
 * control carrying the icon owns the accessible name. Default size fits a 28px control.
 */
/** Icon sizes: 12, 14, 16 (the default, beside body text) and 20 (phone bars). */
const SIZE = { xs: "size-3", sm: "size-3.5", md: "size-4", lg: "size-5" } as const;
export type IconSize = keyof typeof SIZE;

export function Icon(props: {
	icon: IconData;
	size?: IconSize;
	class?: string;
	strokeWidth?: number;
}): JSX.Element {
	return (
		<svg
			// A class that sets its own size wins; otherwise the size scale applies and the class adds to it.
			class={`shrink-0 ${props.class?.includes("size-") ? "" : SIZE[props.size ?? "md"]} ${props.class ?? ""}`}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			innerHTML={markup(props.icon, props.strokeWidth ?? STROKE_WIDTH)}
		/>
	);
}

/** Every named icon takes a size from the scale; `class` is for the rare layout need. */
export type IconProps = { size?: IconSize; class?: string };
