import type { JSX } from "@solidjs/web";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";

import { Icon, type IconProps } from "../icon";

export function SettingsIcon(props: IconProps): JSX.Element {
	return <Icon icon={Settings01Icon} size={props.size} class={props.class} />;
}
