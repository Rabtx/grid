import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";
import { appName, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			// The artwork is white-on-transparent for dark surfaces; `invert` plus
			// `hue-rotate-180` restores it on the light theme without a second file.
			title: (
				<Image
					src="/brand/grid-logo.png"
					alt={appName}
					width={1997}
					height={788}
					priority
					className="h-5 w-auto invert hue-rotate-180 dark:invert-0 dark:hue-rotate-0"
				/>
			),
		},
		links: [{ text: "Docs", url: "/docs" }],
		githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
	};
}
