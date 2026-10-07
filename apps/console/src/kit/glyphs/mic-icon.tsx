import type { JSX } from "@solidjs/web";
import Mic01Icon from "@hugeicons/core-free-icons/Mic01Icon";

import { Icon, type IconProps } from "../icon";

export function MicIcon(props: IconProps): JSX.Element {
	return <Icon icon={Mic01Icon} size={props.size} class={props.class} />;
}
