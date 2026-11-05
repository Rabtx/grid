import type { JSX } from "@solidjs/web";
import ArrowShrink02Icon from "@hugeicons/core-free-icons/ArrowShrink02Icon";

import { Icon, type IconProps } from "../icon";

export function MinimizeIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowShrink02Icon} size={props.size} class={props.class} />;
}
