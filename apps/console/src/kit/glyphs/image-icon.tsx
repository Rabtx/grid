import type { JSX } from "@solidjs/web";
import Image01Glyph from "@hugeicons/core-free-icons/Image01Icon";

import { Icon, type IconProps } from "../icon";

export function ImageIcon(props: IconProps): JSX.Element {
	return <Icon icon={Image01Glyph} size={props.size} class={props.class} />;
}
