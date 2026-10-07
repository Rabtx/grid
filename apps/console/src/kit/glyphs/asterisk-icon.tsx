import type { JSX } from "@solidjs/web";
import AsteriskGlyph from "@hugeicons/core-free-icons/AsteriskIcon";

import { Icon, type IconProps } from "../icon";

/** Agents. */
export function AsteriskIcon(props: IconProps): JSX.Element {
	return <Icon icon={AsteriskGlyph} size={props.size} class={props.class} />;
}
