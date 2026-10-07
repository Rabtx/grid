import type { JSX } from "@solidjs/web";
import InformationCircleGlyph from "@hugeicons/core-free-icons/InformationCircleIcon";

import { Icon, type IconProps } from "../icon";

export function InfoIcon(props: IconProps): JSX.Element {
	return <Icon icon={InformationCircleGlyph} size={props.size} class={props.class} />;
}
