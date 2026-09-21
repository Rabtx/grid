import Link from "next/link";
import { SITE } from "../data/landing.data";

export function SiteFooter() {
	return (
		<footer>
			<div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-10">
				<p className="text-muted-foreground text-xs">
					{SITE.name} — dual-licensed MIT or Apache-2.0.
				</p>
				<nav className="flex items-center gap-4 text-xs">
					<Link href={SITE.repoUrl} className="text-muted-foreground hover:text-foreground">
						GitHub
					</Link>
					<Link href="#install" className="text-muted-foreground hover:text-foreground">
						Install
					</Link>
					<Link href={SITE.signInUrl} className="text-muted-foreground hover:text-foreground">
						Sign in
					</Link>
				</nav>
			</div>
		</footer>
	);
}
