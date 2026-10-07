import type { JSX } from "@solidjs/web";
import GitBranchIcon from "@hugeicons/core-free-icons/GitBranchIcon";

import { Icon, type IconProps } from "../icon";

export function BranchIcon(props: IconProps): JSX.Element {
	return <Icon icon={GitBranchIcon} size={props.size} class={props.class} />;
}
