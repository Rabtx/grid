import type { JSX } from "@solidjs/web";
import Sorting05Glyph from "@hugeicons/core-free-icons/Sorting05Icon";

import { Icon, type IconProps } from "../icon";

export function SortIcon(props: IconProps): JSX.Element {
	return <Icon icon={Sorting05Glyph} size={props.size} class={props.class} />;
}
