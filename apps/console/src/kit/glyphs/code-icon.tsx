import type { JSX } from "@solidjs/web";
import CodeGlyph from "@hugeicons/core-free-icons/CodeIcon";

import { Icon, type IconProps } from "../icon";

export function CodeIcon(props: IconProps): JSX.Element {
	return <Icon icon={CodeGlyph} size={props.size} class={props.class} />;
}
