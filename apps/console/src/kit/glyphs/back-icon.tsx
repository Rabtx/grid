import type { JSX } from "@solidjs/web";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";

import { Icon, type IconProps } from "../icon";

export function BackIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowLeft01Icon} size={props.size} class={props.class} />;
}
