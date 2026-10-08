import { buttonVariants } from "@grid/ui/components/button";
import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { cn } from "@/lib/utils";
import { SITE } from "../data/landing.data";

export function SiteHeader() {
	return (
		<header className="sticky top-0 z-40 border-border/60 border-b bg-background/80 backdrop-blur">
			<div className="mx-auto flex h-14 w-full max-w-[1088px] items-center justify-between gap-4 px-4 sm:px-6">
				<Link href="/" aria-label={`${SITE.name} home`} className="flex items-center">
					<BrandLogo />
				</Link>
				<nav className="flex items-center gap-1">
					<Link
						href="#features"
						className={cn(
							buttonVariants({ variant: "ghost", size: "sm" }),
							"hidden sm:inline-flex",
						)}
					>
						Features
					</Link>
					<Link
						href="#install"
						className={cn(
							buttonVariants({ variant: "ghost", size: "sm" }),
							"hidden sm:inline-flex",
						)}
					>
						Install
					</Link>
					<Link
						href={SITE.repoUrl}
						className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
					>
						GitHub
					</Link>
					{SITE.signInUrl ? (
						<Link
							href={SITE.signInUrl}
							className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
						>
							Sign in
						</Link>
					) : null}
					<ThemeToggle
						className="size-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
						iconClassName="size-4"
					/>
				</nav>
			</div>
		</header>
	);
}
