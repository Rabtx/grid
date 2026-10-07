import type { JSX } from "@solidjs/web";
import Note01Icon from "@hugeicons/core-free-icons/Note01Icon";

import { Icon, type IconProps } from "../icon";

export function NoteIcon(props: IconProps): JSX.Element {
	return <Icon icon={Note01Icon} size={props.size} class={props.class} />;
}
