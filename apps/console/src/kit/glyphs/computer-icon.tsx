import type { JSX } from "@solidjs/web";
import ComputerGlyph from "@hugeicons/core-free-icons/ComputerIcon";

import { Icon, type IconProps } from "../icon";

export function ComputerIcon(props: IconProps): JSX.Element {
	return <Icon icon={ComputerGlyph} size={props.size} class={props.class} />;
}
