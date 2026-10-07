import type { JSX } from "@solidjs/web";
import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";

import { Icon, type IconProps } from "../icon";

export function PlusIcon(props: IconProps): JSX.Element {
	return <Icon icon={Add01Icon} size={props.size} class={props.class} />;
}
