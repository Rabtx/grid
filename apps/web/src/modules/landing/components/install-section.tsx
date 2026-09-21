import { INSTALL_STEPS, REQUIREMENTS, SITE } from "../data/landing.data";

export function InstallSection() {
	return (
		<section id="install" className="border-border/60 border-b scroll-mt-14">
			<div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
				<h2 className="font-semibold text-2xl tracking-tight">Install Grid</h2>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
					Grid self-hosts. Clone it, install with Bun, and it runs on your machine — the browser is
					the interface, so anything you can reach it from becomes a workstation.
				</p>

				<ul className="mt-6 flex flex-wrap gap-2">
					{REQUIREMENTS.map((requirement) => (
						<li
							key={requirement}
							className="rounded-md border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground"
						>
							{requirement}
						</li>
					))}
				</ul>

				<ol className="mt-8 space-y-4">
					{INSTALL_STEPS.map((step, index) => (
						<li key={step.id} className="min-w-0">
							<p className="flex items-baseline gap-2 text-sm">
								<span className="font-mono text-muted-foreground text-xs">
									{String(index + 1).padStart(2, "0")}
								</span>
								<span className="font-medium">{step.label}</span>
							</p>
							<pre className="mt-2 min-w-0 overflow-x-auto rounded-lg border border-border bg-muted/40 px-4 py-3">
								<code className="font-mono text-[13px] leading-6">{step.command}</code>
							</pre>
						</li>
					))}
				</ol>

				<p className="mt-6 text-muted-foreground text-sm leading-6">
					The web control plane starts on <code className="font-mono text-xs">:3000</code>, the API
					on <code className="font-mono text-xs">:4000</code> and the docs on{" "}
					<code className="font-mono text-xs">:3002</code>. Full setup, Docker and deployment notes
					live in the{" "}
					<a
						href={`${SITE.repoUrl}#readme`}
						className="text-foreground underline underline-offset-4"
					>
						repository README
					</a>
					.
				</p>
			</div>
		</section>
	);
}
