import type { JSX } from "@solidjs/web";
import StarGlyph from "@hugeicons/core-free-icons/StarIcon";

import { Icon, type IconProps } from "../icon";

export function StarIcon(props: IconProps): JSX.Element {
	return <Icon icon={StarGlyph} size={props.size} class={props.class} />;
}
