import type { JSX } from "@solidjs/web";
import Tag01Glyph from "@hugeicons/core-free-icons/Tag01Icon";

import { Icon, type IconProps } from "../icon";

export function TagIcon(props: IconProps): JSX.Element {
	return <Icon icon={Tag01Glyph} size={props.size} class={props.class} />;
}
