import type { JSX } from "@solidjs/web";
import CloudGlyph from "@hugeicons/core-free-icons/CloudIcon";

import { Icon, type IconProps } from "../icon";

/** Ship: where the work goes out. */
export function CloudIcon(props: IconProps): JSX.Element {
	return <Icon icon={CloudGlyph} size={props.size} class={props.class} />;
}
