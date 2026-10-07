import type { JSX } from "@solidjs/web";
import CheckmarkSquare02Glyph from "@hugeicons/core-free-icons/CheckmarkSquare02Icon";

import { Icon, type IconProps } from "../icon";

/** A checklist: a ticked box (the note's format bar). */
export function ChecklistIcon(props: IconProps): JSX.Element {
	return <Icon icon={CheckmarkSquare02Glyph} size={props.size} class={props.class} />;
}
