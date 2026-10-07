import type { JSX } from "@solidjs/web";
import Link01Glyph from "@hugeicons/core-free-icons/Link01Icon";

import { Icon, type IconProps } from "../icon";

export function LinkIcon(props: IconProps): JSX.Element {
	return <Icon icon={Link01Glyph} size={props.size} class={props.class} />;
}
