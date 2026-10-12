import { ArrowLeft01Icon, Calendar03Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { formatPostDate, type PostMeta } from "../data/posts.data";
import type { TocEntry } from "../posts";

/** A post page: header, a sticky contents list from `lg:`, and the body in a reading column. */
export function PostArticle({
	post,
	toc,
	children,
}: {
	post: PostMeta;
	toc: readonly TocEntry[];
	children: React.ReactNode;
}) {
	return (
		<article className="px-4 pt-10 pb-24 sm:px-6 sm:pt-16 sm:pb-32">
			<div className="mx-auto max-w-[1088px]">
				<Link
					href="/blog"
					className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] text-muted-foreground hover:text-foreground"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.5} />
					All posts
				</Link>
				<header className="mt-6 max-w-[720px]">
					<ul className="flex flex-wrap gap-1.5">
						{post.tags.map((tag) => (
							<li
								key={tag}
								className="rounded-md border border-border px-2 py-0.5 text-[12px] text-muted-foreground"
							>
								{tag}
							</li>
						))}
					</ul>
					<h1 className="mt-4 text-balance font-semibold text-[32px] leading-[1.15] tracking-[-0.03em] sm:text-5xl">
						{post.title}
					</h1>
					<p className="mt-4 text-[17px] text-muted-foreground leading-7">{post.summary}</p>
					<p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted-foreground">
						<span className="font-medium text-foreground">{post.author}</span>
						<span className="inline-flex items-center gap-1.5">
							<HugeiconsIcon icon={Calendar03Icon} className="size-4" strokeWidth={1.5} />
							<time dateTime={post.published}>{formatPostDate(post.published)}</time>
						</span>
						<span className="inline-flex items-center gap-1.5">
							<HugeiconsIcon icon={Clock01Icon} className="size-4" strokeWidth={1.5} />
							{post.readMinutes} min read
						</span>
					</p>
				</header>
				<div className="mt-12 border-border/60 border-t pt-12 lg:grid lg:grid-cols-[minmax(0,720px)_1fr] lg:gap-16">
					<div className="min-w-0">{children}</div>
					<nav aria-label="On this page" className="hidden lg:block">
						<div className="sticky top-24">
							<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.18em]">
								On this page
							</p>
							<ul className="mt-4 space-y-2 border-border border-l text-[14px]">
								{toc.map((entry) => (
									<li key={entry.id}>
										<a
											href={`#${entry.id}`}
											className="-ml-px block border-transparent border-l py-0.5 pl-4 text-muted-foreground hover:border-foreground hover:text-foreground"
										>
											{entry.label}
										</a>
									</li>
								))}
							</ul>
						</div>
					</nav>
				</div>
			</div>
		</article>
	);
}
