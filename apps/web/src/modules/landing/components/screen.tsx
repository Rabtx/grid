import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * A real console screenshot in a window frame, captured at 1440×900 in both themes; the one that
 * matches the site's theme shows.
 */
export function Screen({
	name,
	alt,
	priority = false,
	className,
}: {
	name: "board" | "agents";
	alt: string;
	priority?: boolean;
	className?: string;
}) {
	const shared = {
		width: 2880,
		height: 1800,
		sizes: "(min-width: 1120px) 1072px, calc(100vw - 32px)",
		className: "block h-auto w-full",
	};
	return (
		<figure
			className={cn(
				"overflow-hidden rounded-xl border border-border bg-card p-1.5 sm:rounded-2xl sm:p-2",
				className,
			)}
		>
			<div className="overflow-hidden rounded-lg border border-border/60 sm:rounded-xl">
				<Image
					src={`/screens/${name}-light.webp`}
					alt={alt}
					{...shared}
					className={cn(shared.className, "dark:hidden")}
				/>
				{/* Dark is the site's default theme, so only its screenshot is worth preloading. */}
				<Image
					src={`/screens/${name}-dark.webp`}
					alt={alt}
					{...shared}
					priority={priority}
					className={cn(shared.className, "hidden dark:block")}
				/>
			</div>
		</figure>
	);
}
