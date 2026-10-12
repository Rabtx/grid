import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { formatPostDate, POSTS } from "../data/posts.data";

/** The blog index: every post, newest first. */
export function PostList() {
	return (
		<section className="px-4 pt-14 pb-24 sm:px-6 sm:pt-20 sm:pb-32">
			<div className="mx-auto max-w-[1088px]">
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.18em]">Blog</p>
				<h1 className="mt-3 text-balance font-semibold text-4xl tracking-[-0.03em] sm:text-5xl">
					Notes from building Grid.
				</h1>
				<p className="mt-4 max-w-xl text-[17px] text-muted-foreground leading-7">
					Design, engineering and what we learn building an AI-native workspace with agents in the
					loop.
				</p>
				<ul className="mt-12 divide-y divide-border border-border border-y">
					{POSTS.map((post) => (
						<li key={post.slug}>
							<Link
								href={`/blog/${post.slug}`}
								className="group flex flex-col gap-2 py-6 sm:flex-row sm:items-start sm:gap-10 sm:py-8"
							>
								<time
									dateTime={post.published}
									className="shrink-0 text-[14px] text-muted-foreground sm:w-40 sm:pt-1"
								>
									{formatPostDate(post.published)}
								</time>
								<div className="min-w-0 flex-1">
									<h2 className="text-balance font-semibold text-[20px] leading-7 group-hover:underline group-hover:underline-offset-4">
										{post.title}
									</h2>
									<p className="mt-2 text-[15px] text-muted-foreground leading-6">{post.summary}</p>
									<p className="mt-3 inline-flex items-center gap-1 font-medium text-[14px]">
										Read · {post.readMinutes} min
										<HugeiconsIcon
											icon={ArrowRight01Icon}
											className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
											strokeWidth={1.5}
										/>
									</p>
								</div>
							</Link>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
