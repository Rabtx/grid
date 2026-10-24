import type { JSX } from "@solidjs/web";
import BrowserHugeIcon from "@hugeicons/core-free-icons/BrowserIcon";

import { Icon, type IconProps } from "../icon";

export function BrowserIcon(props: IconProps): JSX.Element {
	return <Icon icon={BrowserHugeIcon} size={props.size} class={props.class} />;
}
