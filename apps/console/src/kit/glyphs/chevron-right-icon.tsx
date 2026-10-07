import type { JSX } from "@solidjs/web";
import ArrowRight01Glyph from "@hugeicons/core-free-icons/ArrowRight01Icon";

import { Icon, type IconProps } from "../icon";

export function ChevronRightIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowRight01Glyph} size={props.size} class={props.class} />;
}
