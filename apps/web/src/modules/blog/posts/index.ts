import type { ComponentType } from "react";
import { UiUxDesignInTheAiEra, TOC as uiUxToc } from "./ui-ux-design-in-the-ai-era";

export type TocEntry = { id: string; label: string };

/** Each post's body and table of contents, keyed by its slug in `POSTS`. */
export const POST_BODIES: Record<string, { Body: ComponentType; toc: readonly TocEntry[] }> = {
	"ui-ux-design-in-the-ai-era": { Body: UiUxDesignInTheAiEra, toc: uiUxToc },
};
