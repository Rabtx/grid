import type { JSX } from "@solidjs/web";
import Key01Glyph from "@hugeicons/core-free-icons/Key01Icon";

import { Icon, type IconProps } from "../icon";

export function KeyIcon(props: IconProps): JSX.Element {
	return <Icon icon={Key01Glyph} size={props.size} class={props.class} />;
}
