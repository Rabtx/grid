import { buttonVariants } from "@grid/ui/components/button";
import Link from "next/link";
import { BrandLogo, BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { SITE } from "../data/landing.data";

export function SiteFooter() {
	return (
		<footer className="border-border/60 border-t px-4 sm:px-6">
			<div className="mx-auto flex max-w-[1088px] flex-col items-center py-24 text-center sm:py-32">
				<BrandMark className="size-10" />
				<h2 className="mt-6 text-balance font-semibold text-3xl tracking-[-0.03em] sm:text-4xl">
					Grid is early, and open.
				</h2>
				<p className="mt-3 max-w-md text-[16px] text-muted-foreground leading-7">
					Try it on your own machine, and tell us what breaks on GitHub.
				</p>
				<div className="mt-8 flex flex-wrap justify-center gap-2">
					<Link href="#install" className={cn(buttonVariants(), "rounded-full")}>
						Install Grid
					</Link>
					<Link
						href={SITE.repoUrl}
						className={cn(buttonVariants({ variant: "outline" }), "rounded-full")}
					>
						View on GitHub
					</Link>
				</div>
			</div>
			<div className="mx-auto flex max-w-[1088px] flex-col items-center gap-4 border-border/60 border-t py-8 sm:flex-row sm:justify-between">
				<BrandLogo />
				<nav className="flex items-center gap-5 text-muted-foreground text-sm">
					<Link href="#features" className="hover:text-foreground">
						Features
					</Link>
					<Link href="#install" className="hover:text-foreground">
						Install
					</Link>
					<Link href={SITE.docsUrl} className="hover:text-foreground">
						Guide
					</Link>
					<Link href={SITE.repoUrl} className="hover:text-foreground">
						GitHub
					</Link>
				</nav>
				<p className="text-muted-foreground text-sm">MIT or Apache-2.0</p>
			</div>
		</footer>
	);
}
