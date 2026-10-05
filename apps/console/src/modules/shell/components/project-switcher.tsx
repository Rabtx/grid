import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { CheckIcon, Menu, menuTrigger, Text, UnfoldIcon } from "@/kit";
import { ProjectIcon, useWorkspace } from "@/modules/projects";

/** The pages that belong to one project at a time: `/<page>/<project>`. */
export const PROJECT_PAGE = /^\/(board|files|pulls|notes|ship|operate)\/([^/]+)/;

/**
 * Which project a board, files, pull requests, notes or ship page shows, as the page's title: open it to
 * show another project's same page. The sidebar lists these pages once, so this is where you pick.
 */
export function ProjectSwitcher(): JSX.Element {
	const workspace = useWorkspace();
	const location = useLocation();
	const navigate = useNavigate();
	const page = () => PROJECT_PAGE.exec(location.pathname)?.[1] ?? "board";
	const current = () => workspace.currentProject();

	return (
		<Menu
			label="Show another project"
			triggerClass={menuTrigger({ size: "sm" })}
			trigger={
				<>
					<Show when={current()}>{(project) => <ProjectIcon project={project()} />}</Show>
					<Text as="span" tone="strong" weight="medium" truncate>
						{current()?.name ?? "Choose a project"}
					</Text>
					<UnfoldIcon size="sm" class="text-fg-subtle" />
				</>
			}
			groups={[
				{
					label: "Projects",
					items: workspace.projects().map((project) => ({
						id: project.slug,
						label: project.name,
						icon: <ProjectIcon project={project} />,
						trailing:
							project.slug === workspace.currentSlug() ? <CheckIcon size="sm" /> : undefined,
					})),
				},
			]}
			onSelect={(slug) => navigate(`/${page()}/${slug}`)}
		/>
	);
}
