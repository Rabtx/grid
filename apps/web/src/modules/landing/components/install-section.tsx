import { COMMANDS, INSTALLS, SITE } from "../data/landing.data";
import { SectionHeading } from "./section-heading";

export function InstallSection() {
	return (
		<section
			id="install"
			className="scroll-mt-16 border-border/60 border-t px-4 py-24 sm:px-6 sm:py-32"
		>
			<div className="mx-auto max-w-[1088px]">
				<SectionHeading label="Install" title="One command, on any machine you own.">
					Run Grid where you want it to live. Add more machines with the runner, and Grid works on
					them as if they were one.
				</SectionHeading>

				<div className="mt-12 grid gap-4 lg:grid-cols-2">
					{INSTALLS.map((install) => (
						<article
							key={install.id}
							className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-6 sm:p-8"
						>
							<h3 className="font-semibold text-xl tracking-[-0.02em]">{install.title}</h3>
							<p className="mt-1.5 text-[15px] text-muted-foreground leading-6">
								{install.summary}
							</p>
							<pre className="mt-6 whitespace-pre-wrap break-all rounded-xl border border-border bg-background px-4 py-3">
								<code className="font-mono text-[13px]">{install.command}</code>
							</pre>
							<ol className="mt-6 flex flex-col gap-3 text-[15px]">
								{install.steps.map((step, index) => (
									<li key={step} className="flex gap-3">
										<span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-border font-mono text-[10px] text-muted-foreground">
											{index + 1}
										</span>
										{step}
									</li>
								))}
							</ol>
							<p className="mt-auto pt-6 text-muted-foreground text-xs">Needs {install.needs}.</p>
						</article>
					))}
				</div>

				<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
					<div className="rounded-2xl border border-border p-6 sm:p-8">
						<h3 className="font-semibold text-[15px]">Then, from any terminal</h3>
						<dl className="mt-4 text-sm">
							{COMMANDS.map(([command, meaning]) => (
								<div
									key={command}
									className="flex flex-col gap-0.5 border-border border-t py-2.5 sm:flex-row sm:gap-4"
								>
									<dt className="w-32 shrink-0 font-mono text-[13px]">{command}</dt>
									<dd className="text-muted-foreground">{meaning}</dd>
								</div>
							))}
						</dl>
					</div>
					<div className="flex flex-col rounded-2xl border border-border p-6 sm:p-8">
						<h3 className="font-semibold text-[15px]">Other ways to run it</h3>
						<p className="mt-2 text-[15px] text-muted-foreground leading-6">
							Docker Compose on a VPS, a GitHub Codespace, or a checkout with{" "}
							<code className="font-mono text-[13px] text-foreground">bun run grid</code>.
						</p>
						<a
							href={SITE.docsUrl}
							className="mt-auto pt-6 font-medium text-sm underline decoration-border underline-offset-4 hover:decoration-foreground"
						>
							Read the guide →
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}
