import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost, POST_BODIES, POSTS, PostArticle } from "@/modules/blog";
import { SiteFooter, SiteHeader } from "@/modules/landing";

type Props = { params: Promise<{ slug: string }> };

/** Every post is built at build time; any other slug is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
	return POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const post = getPost((await params).slug);
	if (!post) return {};
	const url = `/blog/${post.slug}`;
	return {
		title: post.title,
		description: post.summary,
		alternates: { canonical: url },
		openGraph: {
			type: "article",
			url,
			title: post.title,
			description: post.summary,
			publishedTime: post.published,
			authors: [post.author],
			tags: [...post.tags],
		},
		twitter: { card: "summary_large_image", title: post.title, description: post.summary },
	};
}

export default async function BlogPostPage({ params }: Props) {
	const { slug } = await params;
	const post = getPost(slug);
	const entry = POST_BODIES[slug];
	if (!post || !entry) notFound();
	const { Body, toc } = entry;
	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<main className="flex-1">
				<PostArticle post={post} toc={toc}>
					<Body />
				</PostArticle>
			</main>
			<SiteFooter />
		</div>
	);
}
