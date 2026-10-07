import type { JSX } from "@solidjs/web";
import InboxGlyph from "@hugeicons/core-free-icons/InboxIcon";

import { Icon, type IconProps } from "../icon";

export function InboxIcon(props: IconProps): JSX.Element {
	return <Icon icon={InboxGlyph} size={props.size} class={props.class} />;
}
