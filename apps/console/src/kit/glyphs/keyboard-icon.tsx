import type { JSX } from "@solidjs/web";
import KeyboardHugeIcon from "@hugeicons/core-free-icons/KeyboardIcon";

import { Icon, type IconProps } from "../icon";

export function KeyboardIcon(props: IconProps): JSX.Element {
	return <Icon icon={KeyboardHugeIcon} size={props.size} class={props.class} />;
}
