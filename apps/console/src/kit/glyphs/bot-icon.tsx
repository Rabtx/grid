import type { JSX } from "@solidjs/web";
import BotIconData from "@hugeicons/core-free-icons/BotIcon";

import { Icon, type IconProps } from "../icon";

export function BotIcon(props: IconProps): JSX.Element {
	return <Icon icon={BotIconData} size={props.size} class={props.class} />;
}
