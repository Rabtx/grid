import type { JSX } from "@solidjs/web";
import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon";

import { Icon, type IconProps } from "../icon";

export function MenuIcon(props: IconProps): JSX.Element {
	return <Icon icon={Menu01Icon} size={props.size} class={props.class} />;
}
