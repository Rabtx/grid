import type { JSX } from "@solidjs/web";
import Notification01Glyph from "@hugeicons/core-free-icons/Notification01Icon";

import { Icon, type IconProps } from "../icon";

export function BellIcon(props: IconProps): JSX.Element {
	return <Icon icon={Notification01Glyph} size={props.size} class={props.class} />;
}
