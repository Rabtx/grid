import type { JSX } from "@solidjs/web";
import ComputerTerminal01Icon from "@hugeicons/core-free-icons/ComputerTerminal01Icon";

import { Icon, type IconProps } from "../icon";

export function TerminalIcon(props: IconProps): JSX.Element {
	return <Icon icon={ComputerTerminal01Icon} size={props.size} class={props.class} />;
}
