import type { JSX } from "@solidjs/web";
import LeftToRightListBulletGlyph from "@hugeicons/core-free-icons/LeftToRightListBulletIcon";

import { Icon, type IconProps } from "../icon";

/** A bulleted list (the note's format bar). */
export function ListIcon(props: IconProps): JSX.Element {
	return <Icon icon={LeftToRightListBulletGlyph} size={props.size} class={props.class} />;
}
