import type { JSX } from "@solidjs/web";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";

import { Icon, type IconProps } from "../icon";

/** A spinning ring for work in progress; still under reduced motion. */
export function SpinnerIcon(props: IconProps): JSX.Element {
	return (
		<Icon icon={Loading03Icon} class={`motion-safe:animate-spin ${props.class ?? "size-4"}`} />
	);
}
