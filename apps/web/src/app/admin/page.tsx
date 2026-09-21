import { FadeIn } from "./_components/fade-in";

type Area = { id: string; label: string; summary: string };

// Grid's product surfaces. None of these are implemented yet, so this page states
// that plainly rather than rendering placeholder metrics that look like real data.
const areas: Area[] = [
	{ id: "projects", label: "Projects", summary: "Repositories, environments and context" },
	{ id: "board", label: "Board", summary: "Tasks, dependencies and agent assignments" },
	{ id: "build", label: "Build", summary: "Code, terminal, git and agent sessions" },
	{ id: "review", label: "Review", summary: "Diffs, comments, tests and approvals" },
	{ id: "ship", label: "Ship", summary: "Builds, releases and deployments" },
	{ id: "operate", label: "Operate", summary: "Infrastructure, logs, metrics and health" },
	{ id: "incidents", label: "Incidents", summary: "Errors, alerts, root cause and fixes" },
	{ id: "knowledge", label: "Knowledge", summary: "Docs, decisions and architecture" },
	{ id: "agents", label: "Agents", summary: "Roster, roles, sessions and permissions" },
];

const AdminPage = () => {
	return (
		// min-w-0: grid/flex children default to min-width:auto and can blow past the viewport
		<div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-6 px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
			<FadeIn>
				<header className="space-y-1">
					<h1 className="font-semibold text-2xl tracking-tight">Home</h1>
					<p className="text-muted-foreground text-sm">
						Grid's control plane. The surfaces below are defined but not built yet.
					</p>
				</header>
			</FadeIn>
			<FadeIn delay={0.04}>
				<ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{areas.map((area) => (
						<li key={area.id} className="min-w-0 rounded-lg border border-border bg-card px-4 py-3">
							<div className="flex items-baseline justify-between gap-3">
								<span className="font-medium text-sm">{area.label}</span>
								<span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
									not built
								</span>
							</div>
							<p className="mt-1 text-muted-foreground text-xs">{area.summary}</p>
						</li>
					))}
				</ul>
			</FadeIn>
		</div>
	);
};

export default AdminPage;
