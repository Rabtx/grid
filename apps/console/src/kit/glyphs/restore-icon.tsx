import type { JSX } from "@solidjs/web";
import RotateCcwIcon from "@hugeicons/core-free-icons/RotateCcwIcon";

import { Icon, type IconProps } from "../icon";

export function RestoreIcon(props: IconProps): JSX.Element {
	return <Icon icon={RotateCcwIcon} size={props.size} class={props.class} />;
}
