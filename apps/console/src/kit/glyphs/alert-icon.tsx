import type { JSX } from "@solidjs/web";
import AlertCircleIcon from "@hugeicons/core-free-icons/AlertCircleIcon";

import { Icon, type IconProps } from "../icon";

export function AlertIcon(props: IconProps): JSX.Element {
	return <Icon icon={AlertCircleIcon} size={props.size} class={props.class} />;
}
