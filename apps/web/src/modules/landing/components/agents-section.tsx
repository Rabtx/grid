import { AGENTS, PERMISSIONS } from "../data/landing.data";
import { Screen } from "./screen";
import { SectionHeading } from "./section-heading";

export function AgentsSection() {
	return (
		<section className="border-border/60 border-t px-4 py-24 sm:px-6 sm:py-32">
			<div className="mx-auto grid max-w-[1088px] items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
				<div>
					<SectionHeading label="Agents" title="Use the agents you already have.">
						Grid finds the agent CLIs on the machine and uses your own sign-ins. You decide what
						they may do without asking.
					</SectionHeading>
					<ul className="mt-8 flex flex-wrap gap-2">
						{AGENTS.map((agent) => (
							<li key={agent} className="rounded-full border border-border px-3 py-1.5 text-sm">
								{agent}
							</li>
						))}
					</ul>
					<dl className="mt-8 border-border border-t text-sm">
						{PERMISSIONS.map((permission) => (
							<div
								key={permission}
								className="flex items-center justify-between border-border border-b py-2.5"
							>
								<dt>{permission}</dt>
								<dd className="font-mono text-muted-foreground text-xs">Allow · Ask · Never</dd>
							</div>
						))}
					</dl>
				</div>
				<Screen
					name="agents"
					alt="Grid's Agents and permissions settings: Claude Code, opencode, Antigravity and Codex connected, and what agents may do on their own"
				/>
			</div>
		</section>
	);
}
