import type { JSX } from "@solidjs/web";
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon";

import { Icon, type IconProps } from "../icon";

export function ChevronDownIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowDown01Icon} size={props.size} class={props.class} />;
}
