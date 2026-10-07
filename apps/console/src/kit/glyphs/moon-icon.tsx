import type { JSX } from "@solidjs/web";
import Moon02Icon from "@hugeicons/core-free-icons/Moon02Icon";

import { Icon, type IconProps } from "../icon";

export function MoonIcon(props: IconProps): JSX.Element {
	return <Icon icon={Moon02Icon} size={props.size} class={props.class} />;
}
