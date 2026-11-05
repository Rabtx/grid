import type { JSX } from "@solidjs/web";
import LayoutTwoColumnIcon from "@hugeicons/core-free-icons/LayoutTwoColumnIcon";

import { Icon, type IconProps } from "../icon";

export function SplitIcon(props: IconProps): JSX.Element {
	return <Icon icon={LayoutTwoColumnIcon} size={props.size} class={props.class} />;
}
