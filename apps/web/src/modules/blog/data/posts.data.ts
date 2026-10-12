/**
 * Every post on the blog, newest first. A post's body lives in `../posts/<slug>.tsx` and is
 * registered in `../posts/index.ts`; this list is only what the index, metadata and sitemap need.
 */

export type PostMeta = {
	slug: string;
	title: string;
	summary: string;
	/** ISO date, YYYY-MM-DD. */
	published: string;
	readMinutes: number;
	tags: readonly string[];
	author: string;
};

export const POSTS: readonly PostMeta[] = [
	{
		slug: "ui-ux-design-in-the-ai-era",
		title: "UI/UX design in the AI era: tips, tricks and a cheat sheet",
		summary:
			"How we design Grid with AI in the loop: the skills that still matter, the tricks that make agents draw better screens, and the exact numbers we build with.",
		published: "2026-10-12",
		readMinutes: 9,
		tags: ["Design", "AI", "Cheat sheet"],
		author: "RabtX",
	},
];

export function getPost(slug: string): PostMeta | undefined {
	return POSTS.find((post) => post.slug === slug);
}

/** "12 October 2026", fixed to UTC so the server and the browser print the same day. */
export function formatPostDate(iso: string): string {
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${iso}T00:00:00Z`));
}
