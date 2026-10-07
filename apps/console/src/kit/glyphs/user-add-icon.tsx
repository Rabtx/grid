import type { JSX } from "@solidjs/web";
import UserAdd01Glyph from "@hugeicons/core-free-icons/UserAdd01Icon";

import { Icon, type IconProps } from "../icon";

export function UserAddIcon(props: IconProps): JSX.Element {
	return <Icon icon={UserAdd01Glyph} size={props.size} class={props.class} />;
}
