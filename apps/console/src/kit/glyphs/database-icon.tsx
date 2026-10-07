import type { JSX } from "@solidjs/web";
import Database01Glyph from "@hugeicons/core-free-icons/Database01Icon";

import { Icon, type IconProps } from "../icon";

/** Something asking permission: an approval. */
export function DatabaseIcon(props: IconProps): JSX.Element {
	return <Icon icon={Database01Glyph} size={props.size} class={props.class} />;
}
