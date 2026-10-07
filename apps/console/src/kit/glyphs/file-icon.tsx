import type { JSX } from "@solidjs/web";
import File01Icon from "@hugeicons/core-free-icons/File01Icon";

import { Icon, type IconProps } from "../icon";

export function FileIcon(props: IconProps): JSX.Element {
	return <Icon icon={File01Icon} size={props.size} class={props.class} />;
}
