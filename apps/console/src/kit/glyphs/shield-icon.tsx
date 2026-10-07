import type { JSX } from "@solidjs/web";
import Shield01Glyph from "@hugeicons/core-free-icons/Shield01Icon";

import { Icon, type IconProps } from "../icon";

export function ShieldIcon(props: IconProps): JSX.Element {
	return <Icon icon={Shield01Glyph} size={props.size} class={props.class} />;
}
