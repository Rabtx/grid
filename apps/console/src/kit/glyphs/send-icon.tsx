import type { JSX } from "@solidjs/web";
import ArrowUp02Icon from "@hugeicons/core-free-icons/ArrowUp02Icon";

import { Icon, type IconProps } from "../icon";

export function SendIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowUp02Icon} size={props.size} class={props.class} />;
}
