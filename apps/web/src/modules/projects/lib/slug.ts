/**
 * Mirrors the slug rule the API enforces: lowercase, dash-separated, trimmed of
 * leading and trailing dashes, and capped at the column width. Kept out of the
 * board component so it can be tested without rendering anything.
 */
export function toSlug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64)
		.replace(/-+$/g, "");
}
