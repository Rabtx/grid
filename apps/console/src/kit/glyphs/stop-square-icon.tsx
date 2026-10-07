import type { JSX } from "@solidjs/web";
import StopIcon from "@hugeicons/core-free-icons/StopIcon";

import { Icon, type IconProps } from "../icon";

export function StopSquareIcon(props: IconProps): JSX.Element {
	return <Icon icon={StopIcon} size={props.size} class={props.class} />;
}
