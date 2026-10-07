import type { JSX } from "@solidjs/web";
import Wrench01Icon from "@hugeicons/core-free-icons/Wrench01Icon";

import { Icon, type IconProps } from "../icon";

export function ToolIcon(props: IconProps): JSX.Element {
	return <Icon icon={Wrench01Icon} size={props.size} class={props.class} />;
}
