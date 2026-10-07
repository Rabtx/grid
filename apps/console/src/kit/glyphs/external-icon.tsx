import type { JSX } from "@solidjs/web";
import ArrowUpRight01Glyph from "@hugeicons/core-free-icons/ArrowUpRight01Icon";

import { Icon, type IconProps } from "../icon";

export function ExternalIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowUpRight01Glyph} size={props.size} class={props.class} />;
}
