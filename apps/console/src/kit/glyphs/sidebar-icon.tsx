import type { JSX } from "@solidjs/web";
import SidebarLeftIcon from "@hugeicons/core-free-icons/SidebarLeftIcon";

import { Icon, type IconProps } from "../icon";

export function SidebarIcon(props: IconProps): JSX.Element {
	return <Icon icon={SidebarLeftIcon} size={props.size} class={props.class} />;
}
