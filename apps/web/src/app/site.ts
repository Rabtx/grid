/**
 * Absolute origin for metadataBase, canonical URLs, sitemap, robots and the install command.
 * NEXT_PUBLIC_SITE_URL wins; on Vercel the project's production domain is the fallback, so a
 * deployment without it never advertises localhost. Localhost is the local fallback.
 */
const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const SITE_URL = (
	process.env.NEXT_PUBLIC_SITE_URL ??
	(vercelProduction ? `https://${vercelProduction}` : "http://localhost:3000")
).replace(/\/+$/, "");
