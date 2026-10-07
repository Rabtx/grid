import type { JSX } from "@solidjs/web";
import FlashIcon from "@hugeicons/core-free-icons/FlashIcon";

import { Icon, type IconProps } from "../icon";

/** Automations: a bolt. */
export function BoltIcon(props: IconProps): JSX.Element {
	return <Icon icon={FlashIcon} size={props.size} class={props.class} />;
}
