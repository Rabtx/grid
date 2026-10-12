import type { Metadata } from "next";
import { PostList } from "@/modules/blog";
import { SiteFooter, SiteHeader } from "@/modules/landing";

const description = "Design, engineering and what we learn building Grid with agents in the loop.";

export const metadata: Metadata = {
	title: "Blog",
	description,
	alternates: { canonical: "/blog" },
	openGraph: { url: "/blog", title: "Blog", description },
};

export default function BlogPage() {
	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<main className="flex-1">
				<PostList />
			</main>
			<SiteFooter />
		</div>
	);
}
