import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The brand artwork is white-on-transparent, drawn for a dark surface. In light
 * mode `invert` takes the white marks to near-black, and `hue-rotate-180` puts
 * the accent petal back to its original mint after the inversion flipped it.
 * Dark mode renders the file untouched.
 */
const THEME_FIX = "invert hue-rotate-180 dark:invert-0 dark:hue-rotate-0";

export function BrandLogo({
	className,
	priority = false,
}: {
	className?: string;
	priority?: boolean;
}) {
	return (
		<Image
			src="/brand/grid-logo.png"
			alt="Grid"
			width={1997}
			height={788}
			priority={priority}
			className={cn("h-6 w-auto", THEME_FIX, className)}
		/>
	);
}

export function BrandMark({ className }: { className?: string }) {
	return (
		<Image
			src="/brand/grid-mark.png"
			alt=""
			aria-hidden
			width={512}
			height={512}
			className={cn("size-6", THEME_FIX, className)}
		/>
	);
}
