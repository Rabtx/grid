import { cn } from "@/lib/utils";
import { MARK_ACCENT, MARK_INK, WORDMARK } from "./brand-paths";

/** The brand blue of the mark's accent block, the same in light and dark. */
export const BRAND_BLUE = "#2D7CF6";

/**
 * The Grid mark: three blocks in the text colour and one in the brand blue, so it follows light
 * and dark without separate artwork. Decorative: pair it with text.
 */
export function BrandMark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 64 64" aria-hidden className={cn("size-6 shrink-0", className)}>
			<path fillRule="evenodd" clipRule="evenodd" d={MARK_INK} className="fill-foreground" />
			<path fillRule="evenodd" clipRule="evenodd" d={MARK_ACCENT} fill={BRAND_BLUE} />
		</svg>
	);
}

/** The wordmark alone, "GRID" in the text colour. Height is set by `className`. */
export function BrandWordmark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 80 16" className={cn("h-4 w-auto shrink-0", className)}>
			<title>Grid</title>
			<path fillRule="evenodd" clipRule="evenodd" d={WORDMARK} className="fill-foreground" />
		</svg>
	);
}

/** Mark beside the wordmark, for a header. */
export function BrandLogo({ className }: { className?: string }) {
	return (
		<span className={cn("inline-flex items-center gap-2", className)}>
			<BrandMark className="size-6" />
			<BrandWordmark className="h-3" />
		</span>
	);
}
