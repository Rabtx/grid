import type { JSX } from "@solidjs/web";
import BubbleChatIcon from "@hugeicons/core-free-icons/BubbleChatIcon";

import { Icon, type IconProps } from "../icon";

export function ChatIcon(props: IconProps): JSX.Element {
	return <Icon icon={BubbleChatIcon} size={props.size} class={props.class} />;
}
