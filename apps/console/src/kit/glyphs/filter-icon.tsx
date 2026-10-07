import type { JSX } from "@solidjs/web";
import FilterHorizontalGlyph from "@hugeicons/core-free-icons/FilterHorizontalIcon";

import { Icon, type IconProps } from "../icon";

export function FilterIcon(props: IconProps): JSX.Element {
	return <Icon icon={FilterHorizontalGlyph} size={props.size} class={props.class} />;
}
