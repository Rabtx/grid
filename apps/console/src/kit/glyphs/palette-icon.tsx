import type { JSX } from "@solidjs/web";
import PaintBoardGlyph from "@hugeicons/core-free-icons/PaintBoardIcon";

import { Icon, type IconProps } from "../icon";

/** How the app looks: Appearance. */
export function PaletteIcon(props: IconProps): JSX.Element {
	return <Icon icon={PaintBoardGlyph} size={props.size} class={props.class} />;
}
