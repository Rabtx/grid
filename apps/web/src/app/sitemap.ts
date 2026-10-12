import type { MetadataRoute } from "next";
import { POSTS } from "@/modules/blog";
import { SITE_URL } from "./site";

export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{
			url: SITE_URL,
			lastModified: new Date(),
			changeFrequency: "yearly",
			priority: 1,
		},
		{ url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.6 },
		...POSTS.map((post) => ({
			url: `${SITE_URL}/blog/${post.slug}`,
			lastModified: new Date(`${post.published}T00:00:00Z`),
			changeFrequency: "yearly" as const,
			priority: 0.5,
		})),
	];
}
