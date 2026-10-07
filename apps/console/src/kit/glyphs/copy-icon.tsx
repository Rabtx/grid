import type { JSX } from "@solidjs/web";
import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon";

import { Icon, type IconProps } from "../icon";

export function CopyIcon(props: IconProps): JSX.Element {
	return <Icon icon={Copy01Icon} size={props.size} class={props.class} />;
}
