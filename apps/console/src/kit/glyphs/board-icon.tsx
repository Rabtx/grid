import type { JSX } from "@solidjs/web";
import KanbanGlyph from "@hugeicons/core-free-icons/KanbanIcon";

import { Icon, type IconProps } from "../icon";

/** The board: a kanban, as the Figma rail draws it. */
export function BoardIcon(props: IconProps): JSX.Element {
	return <Icon icon={KanbanGlyph} size={props.size} class={props.class} />;
}
