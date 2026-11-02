import type { JSX } from "@solidjs/web";
import ArrowUp01IconData from "@hugeicons/core-free-icons/ArrowUp01Icon";

import { Icon, type IconProps } from "../icon";

export function ChevronUpIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowUp01IconData} size={props.size} class={props.class} />;
}
