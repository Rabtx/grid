import { buttonVariants } from "@grid/ui/components/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LIFECYCLE, SITE } from "../data/landing.data";

export function HeroSection() {
	return (
		<section className="border-border/60 border-b">
			<div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
				<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
					Open source · early
				</p>
				<h1 className="mt-5 max-w-3xl text-balance font-semibold text-4xl leading-[1.1] tracking-tight sm:text-5xl">
					{SITE.tagline}
				</h1>
				<p className="mt-5 max-w-2xl text-base text-muted-foreground leading-7">{SITE.summary}</p>

				<div className="mt-8 flex flex-wrap items-center gap-3">
					<Link href={SITE.appUrl} className={cn(buttonVariants({ size: "lg" }))}>
						Open Grid
					</Link>
					<Link href="#install" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
						Install it yourself
					</Link>
					<Link
						href={SITE.repoUrl}
						className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
					>
						Source
					</Link>
				</div>

				<div className="mt-14 min-w-0">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
						The loop Grid is built to hold
					</p>
					<ol className="mt-3 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2">
						{LIFECYCLE.map((stage, index) => (
							<li key={stage} className="flex items-center gap-1.5">
								<span className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
									{stage}
								</span>
								{index < LIFECYCLE.length - 1 ? (
									<span aria-hidden className="text-muted-foreground/40 text-xs">
										→
									</span>
								) : null}
							</li>
						))}
					</ol>
				</div>
			</div>
		</section>
	);
}
