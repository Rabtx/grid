import type { JSX } from "@solidjs/web";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";

import { Icon, type IconProps } from "../icon";

export function CloseIcon(props: IconProps): JSX.Element {
	return <Icon icon={Cancel01Icon} size={props.size} class={props.class} />;
}
