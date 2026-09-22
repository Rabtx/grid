/**
 * Absolute origin for metadataBase, canonical URLs, sitemap and robots.
 * Set NEXT_PUBLIC_SITE_URL in production; localhost is the local fallback.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
	/\/+$/,
	"",
);
