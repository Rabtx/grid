import type { JSX } from "@solidjs/web";
import Clock01Glyph from "@hugeicons/core-free-icons/Clock01Icon";

import { Icon, type IconProps } from "../icon";

export function ClockIcon(props: IconProps): JSX.Element {
	return <Icon icon={Clock01Glyph} size={props.size} class={props.class} />;
}
