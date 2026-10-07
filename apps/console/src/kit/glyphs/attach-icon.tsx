import type { JSX } from "@solidjs/web";
import Attachment01Glyph from "@hugeicons/core-free-icons/Attachment01Icon";

import { Icon, type IconProps } from "../icon";

export function AttachIcon(props: IconProps): JSX.Element {
	return <Icon icon={Attachment01Glyph} size={props.size} class={props.class} />;
}
