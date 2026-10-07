import type { JSX } from "@solidjs/web";
import UserGlyph from "@hugeicons/core-free-icons/UserIcon";

import { Icon, type IconProps } from "../icon";

export function UserIcon(props: IconProps): JSX.Element {
	return <Icon icon={UserGlyph} size={props.size} class={props.class} />;
}
