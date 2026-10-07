import type { JSX } from "@solidjs/web";
import ViewGlyph from "@hugeicons/core-free-icons/ViewIcon";

import { Icon, type IconProps } from "../icon";

export function EyeIcon(props: IconProps): JSX.Element {
	return <Icon icon={ViewGlyph} size={props.size} class={props.class} />;
}
