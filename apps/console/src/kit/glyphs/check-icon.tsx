import type { JSX } from "@solidjs/web";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";

import { Icon, type IconProps } from "../icon";

export function CheckIcon(props: IconProps): JSX.Element {
	return <Icon icon={Tick02Icon} size={props.size} class={props.class} />;
}
