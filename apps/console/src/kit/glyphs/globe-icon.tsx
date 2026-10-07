import type { JSX } from "@solidjs/web";
import Globe02Icon from "@hugeicons/core-free-icons/Globe02Icon";

import { Icon, type IconProps } from "../icon";

export function GlobeIcon(props: IconProps): JSX.Element {
	return <Icon icon={Globe02Icon} size={props.size} class={props.class} />;
}
