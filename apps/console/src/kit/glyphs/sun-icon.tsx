import type { JSX } from "@solidjs/web";
import Sun03Icon from "@hugeicons/core-free-icons/Sun03Icon";

import { Icon, type IconProps } from "../icon";

export function SunIcon(props: IconProps): JSX.Element {
	return <Icon icon={Sun03Icon} size={props.size} class={props.class} />;
}
