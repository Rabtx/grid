import type { JSX } from "@solidjs/web";
import LaptopGlyph from "@hugeicons/core-free-icons/LaptopIcon";

import { Icon, type IconProps } from "../icon";

/** A machine that runs Grid. */
export function LaptopIcon(props: IconProps): JSX.Element {
	return <Icon icon={LaptopGlyph} size={props.size} class={props.class} />;
}
