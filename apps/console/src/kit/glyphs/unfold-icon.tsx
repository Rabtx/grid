import type { JSX } from "@solidjs/web";
import UnfoldMoreIcon from "@hugeicons/core-free-icons/UnfoldMoreIcon";

import { Icon, type IconProps } from "../icon";

/** Up-and-down chevrons: a control that opens a list to pick from. */
export function UnfoldIcon(props: IconProps): JSX.Element {
	return <Icon icon={UnfoldMoreIcon} size={props.size} class={props.class} />;
}
