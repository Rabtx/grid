import type { JSX } from "@solidjs/web";
import Layers01Glyph from "@hugeicons/core-free-icons/Layers01Icon";

import { Icon, type IconProps } from "../icon";

export function LayersIcon(props: IconProps): JSX.Element {
	return <Icon icon={Layers01Glyph} size={props.size} class={props.class} />;
}
