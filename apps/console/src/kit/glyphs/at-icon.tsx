import type { JSX } from "@solidjs/web";
import AtGlyph from "@hugeicons/core-free-icons/AtIcon";

import { Icon, type IconProps } from "../icon";

/** Name something: a file in a note. */
export function AtIcon(props: IconProps): JSX.Element {
	return <Icon icon={AtGlyph} size={props.size} class={props.class} />;
}
