import type { JSX } from "@solidjs/web";
import ArrowExpand01Icon from "@hugeicons/core-free-icons/ArrowExpand01Icon";

import { Icon, type IconProps } from "../icon";

export function MaximizeIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowExpand01Icon} size={props.size} class={props.class} />;
}
