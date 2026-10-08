import { buttonVariants } from "@grid/ui/components/button";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { SITE } from "../data/landing.data";
import { InstallCommand } from "./install-command";
import { Screen } from "./screen";

export function HeroSection() {
	return (
		<section className="px-4 pt-16 sm:px-6 sm:pt-24">
			<div className="mx-auto flex max-w-3xl flex-col items-center text-center">
				<BrandMark className="size-12 sm:size-14" />
				<p className="mt-6 rounded-full border border-border px-3 py-1 text-muted-foreground text-xs">
					Open source · runs on your machine
				</p>
				<h1 className="mt-5 text-balance font-semibold text-[40px] leading-[1.05] tracking-[-0.04em] sm:text-6xl">
					{SITE.tagline}
				</h1>
				<p className="mt-5 max-w-xl text-balance text-[17px] text-muted-foreground leading-7">
					{SITE.summary}
				</p>
				<InstallCommand className="mt-10" />
				<div className="mt-6 flex flex-wrap justify-center gap-2">
					<Link
						href="#install"
						className={cn(buttonVariants({ variant: "outline" }), "rounded-full")}
					>
						How the install works
					</Link>
					<Link
						href={SITE.repoUrl}
						className={cn(buttonVariants({ variant: "ghost" }), "rounded-full")}
					>
						View on GitHub
					</Link>
				</div>
			</div>
			<Screen
				name="board"
				alt="Grid's board: tasks in Todo, In progress, In review and Done, some handed to Claude Code, Codex and opencode"
				priority
				className="mx-auto mt-16 max-w-[1088px] sm:mt-20"
			/>
		</section>
	);
}
