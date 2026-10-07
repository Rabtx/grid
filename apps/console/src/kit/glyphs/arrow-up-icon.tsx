import type { JSX } from "@solidjs/web";
import ArrowUp01Glyph from "@hugeicons/core-free-icons/ArrowUp01Icon";

import { Icon, type IconProps } from "../icon";

/** Up a step: promoting to the next environment. */
export function ArrowUpIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowUp01Glyph} size={props.size} class={props.class} />;
}
