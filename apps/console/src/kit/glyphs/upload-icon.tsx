import type { JSX } from "@solidjs/web";
import Upload04Glyph from "@hugeicons/core-free-icons/Upload04Icon";

import { Icon, type IconProps } from "../icon";

export function UploadIcon(props: IconProps): JSX.Element {
	return <Icon icon={Upload04Glyph} size={props.size} class={props.class} />;
}
