import type { JSX } from "@solidjs/web";
import Camera01Glyph from "@hugeicons/core-free-icons/Camera01Icon";

import { Icon, type IconProps } from "../icon";

export function CameraIcon(props: IconProps): JSX.Element {
	return <Icon icon={Camera01Glyph} size={props.size} class={props.class} />;
}
