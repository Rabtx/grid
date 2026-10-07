import type { JSX } from "@solidjs/web";
import Home01Glyph from "@hugeicons/core-free-icons/Home01Icon";

import { Icon, type IconProps } from "../icon";

export function HomeIcon(props: IconProps): JSX.Element {
	return <Icon icon={Home01Glyph} size={props.size} class={props.class} />;
}
