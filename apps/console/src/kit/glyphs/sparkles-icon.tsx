import type { JSX } from "@solidjs/web";
import SparklesGlyph from "@hugeicons/core-free-icons/SparklesIcon";

import { Icon, type IconProps } from "../icon";

export function SparklesIcon(props: IconProps): JSX.Element {
	return <Icon icon={SparklesGlyph} size={props.size} class={props.class} />;
}
