import type { JSX } from "@solidjs/web";
import CheckmarkCircle02Glyph from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";

import { Icon, type IconProps } from "../icon";

export function CheckCircleIcon(props: IconProps): JSX.Element {
	return <Icon icon={CheckmarkCircle02Glyph} size={props.size} class={props.class} />;
}
