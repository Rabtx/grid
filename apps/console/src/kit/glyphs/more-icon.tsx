import type { JSX } from "@solidjs/web";
import MoreHorizontalIcon from "@hugeicons/core-free-icons/MoreHorizontalIcon";

import { Icon, type IconProps } from "../icon";

export function MoreIcon(props: IconProps): JSX.Element {
	return <Icon icon={MoreHorizontalIcon} size={props.size} class={props.class} />;
}
