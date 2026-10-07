import type { JSX } from "@solidjs/web";
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon";

import { Icon, type IconProps } from "../icon";

export function SignOutIcon(props: IconProps): JSX.Element {
	return <Icon icon={Logout01Icon} size={props.size} class={props.class} />;
}
