import type { JSX } from "@solidjs/web";
import GridViewGlyph from "@hugeicons/core-free-icons/GridViewIcon";

import { Icon, type IconProps } from "../icon";

export function AppsIcon(props: IconProps): JSX.Element {
	return <Icon icon={GridViewGlyph} size={props.size} class={props.class} />;
}
