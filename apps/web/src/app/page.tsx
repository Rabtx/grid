import { buttonVariants } from "@grid/ui/components/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Grid's product surfaces are not built yet, so the entry page states what Grid is
// and points at what exists today: sign-in, the control-plane shell, and the docs.
const entries: { href: string; label: string; detail: string }[] = [
	{ href: "/admin", label: "Control plane", detail: "The shell the Grid surfaces will fill" },
	{ href: "/admin/board", label: "Board", detail: "Tasks, stages and agent assignments" },
	{ href: "/login", label: "Sign in", detail: "Email, magic link, passkeys and MFA" },
];

export default function Page() {
	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-10 px-6 py-16">
			<header className="space-y-4">
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">Grid</p>
				<h1 className="max-w-2xl font-semibold text-3xl leading-tight tracking-tight sm:text-4xl">
					An AI-native operating system for building and running a startup
				</h1>
				<p className="max-w-2xl text-muted-foreground text-sm leading-6">
					Projects, agents, development, deployment, infrastructure and operations in one
					browser-accessible control plane. Humans and agents are both first-class workers; the
					machine running the work stays disposable.
				</p>
			</header>

			<nav aria-label="Entry points" className="grid gap-2 sm:grid-cols-3">
				{entries.map((entry) => (
					<Link
						key={entry.href}
						href={entry.href}
						className="group rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/20"
					>
						<span className="block font-medium text-sm">{entry.label}</span>
						<span className="mt-1 block text-muted-foreground text-xs leading-5">
							{entry.detail}
						</span>
					</Link>
				))}
			</nav>

			<footer className="flex flex-wrap items-center gap-3 text-sm">
				<Link
					href="https://github.com/shabirkhan-dev/grid"
					className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
				>
					Repository
				</Link>
				<span className="text-muted-foreground text-xs">
					The board, agent runs, ship and operate surfaces are defined but not implemented yet.
				</span>
			</footer>
		</main>
	);
}
