import type { JSX } from "@solidjs/web";
import Brain01IconData from "@hugeicons/core-free-icons/Brain01Icon";

import { Icon, type IconProps } from "../icon";

export function BrainIcon(props: IconProps): JSX.Element {
	return <Icon icon={Brain01IconData} size={props.size} class={props.class} />;
}
