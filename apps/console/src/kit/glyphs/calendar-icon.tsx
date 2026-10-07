import type { JSX } from "@solidjs/web";
import Calendar03Glyph from "@hugeicons/core-free-icons/Calendar03Icon";

import { Icon, type IconProps } from "../icon";

export function CalendarIcon(props: IconProps): JSX.Element {
	return <Icon icon={Calendar03Glyph} size={props.size} class={props.class} />;
}
