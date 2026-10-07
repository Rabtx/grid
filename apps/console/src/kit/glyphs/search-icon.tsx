import type { JSX } from "@solidjs/web";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";

import { Icon, type IconProps } from "../icon";

export function SearchIcon(props: IconProps): JSX.Element {
	return <Icon icon={Search01Icon} size={props.size} class={props.class} />;
}
