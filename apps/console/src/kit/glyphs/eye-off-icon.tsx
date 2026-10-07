import type { JSX } from "@solidjs/web";
import ViewOffGlyph from "@hugeicons/core-free-icons/ViewOffIcon";

import { Icon, type IconProps } from "../icon";

export function EyeOffIcon(props: IconProps): JSX.Element {
	return <Icon icon={ViewOffGlyph} size={props.size} class={props.class} />;
}
