import type { JSX } from "@solidjs/web";
import Folder01Icon from "@hugeicons/core-free-icons/Folder01Icon";

import { Icon, type IconProps } from "../icon";

export function FolderIcon(props: IconProps): JSX.Element {
	return <Icon icon={Folder01Icon} size={props.size} class={props.class} />;
}
