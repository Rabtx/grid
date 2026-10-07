import type { JSX } from "@solidjs/web";
import Archive01Icon from "@hugeicons/core-free-icons/Archive01Icon";

import { Icon, type IconProps } from "../icon";

export function ArchiveIcon(props: IconProps): JSX.Element {
	return <Icon icon={Archive01Icon} size={props.size} class={props.class} />;
}
