import type { JSX } from "@solidjs/web";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";

import { Icon, type IconProps } from "../icon";

export function TrashIcon(props: IconProps): JSX.Element {
	return <Icon icon={Delete02Icon} size={props.size} class={props.class} />;
}
