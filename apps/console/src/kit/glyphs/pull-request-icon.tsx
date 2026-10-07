import type { JSX } from "@solidjs/web";
import GitPullRequestGlyph from "@hugeicons/core-free-icons/GitPullRequestIcon";

import { Icon, type IconProps } from "../icon";

export function PullRequestIcon(props: IconProps): JSX.Element {
	return <Icon icon={GitPullRequestGlyph} size={props.size} class={props.class} />;
}
