import type { JSX } from "@solidjs/web";
import Idea01Icon from "@hugeicons/core-free-icons/Idea01Icon";

import { Icon, type IconProps } from "../icon";

export function IdeaIcon(props: IconProps): JSX.Element {
	return <Icon icon={Idea01Icon} size={props.size} class={props.class} />;
}
