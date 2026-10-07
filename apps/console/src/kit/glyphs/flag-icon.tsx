import type { JSX } from "@solidjs/web";
import Flag02Glyph from "@hugeicons/core-free-icons/Flag02Icon";

import { Icon, type IconProps } from "../icon";

export function FlagIcon(props: IconProps): JSX.Element {
	return <Icon icon={Flag02Glyph} size={props.size} class={props.class} />;
}
