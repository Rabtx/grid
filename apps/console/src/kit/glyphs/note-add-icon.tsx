import type { JSX } from "@solidjs/web";
import NoteAddGlyph from "@hugeicons/core-free-icons/NoteAddIcon";

import { Icon, type IconProps } from "../icon";

export function NoteAddIcon(props: IconProps): JSX.Element {
	return <Icon icon={NoteAddGlyph} size={props.size} class={props.class} />;
}
