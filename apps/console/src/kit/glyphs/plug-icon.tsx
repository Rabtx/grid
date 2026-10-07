import type { JSX } from "@solidjs/web";
import Plug01Glyph from "@hugeicons/core-free-icons/Plug01Icon";

import { Icon, type IconProps } from "../icon";

/** A service plugged in: Connectors. */
export function PlugIcon(props: IconProps): JSX.Element {
	return <Icon icon={Plug01Glyph} size={props.size} class={props.class} />;
}
