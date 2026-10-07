import type { JSX } from "@solidjs/web";
import Rocket01Glyph from "@hugeicons/core-free-icons/Rocket01Icon";

import { Icon, type IconProps } from "../icon";

export function RocketIcon(props: IconProps): JSX.Element {
	return <Icon icon={Rocket01Glyph} size={props.size} class={props.class} />;
}
