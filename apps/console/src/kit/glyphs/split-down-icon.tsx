import type { JSX } from "@solidjs/web";
import LayoutTwoRowIcon from "@hugeicons/core-free-icons/LayoutTwoRowIcon";

import { Icon, type IconProps } from "../icon";

export function SplitDownIcon(props: IconProps): JSX.Element {
	return <Icon icon={LayoutTwoRowIcon} size={props.size} class={props.class} />;
}
