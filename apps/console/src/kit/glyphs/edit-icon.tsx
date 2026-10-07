import type { JSX } from "@solidjs/web";
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";

import { Icon, type IconProps } from "../icon";

export function EditIcon(props: IconProps): JSX.Element {
	return <Icon icon={PencilEdit01Icon} size={props.size} class={props.class} />;
}
