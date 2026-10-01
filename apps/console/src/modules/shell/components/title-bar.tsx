import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading, Show } from "solid-js";

import { EditIcon, IconButton, Row, SidebarIcon, Text } from "@/kit";
import { useWorkspace } from "@/modules/projects";

import { useShell } from "../context/shell-context";

import { PROJECT_PAGE, ProjectSwitcher } from "./project-switcher";
import { sectionTitle } from "./sidebar";

/**
 * Where you are, as the Figma top bar's breadcrumb: the section in the muted ink, then — on a
 * project's page (board, files, pull requests, notes) — the project, which switches to another
 * project's same page.
 */
function Breadcrumb(): JSX.Element {
	const workspace = useWorkspace();
	const location = useLocation();
	const projectPage = () => PROJECT_PAGE.test(location.pathname);

	return (
		<Row gap={1.5} class="min-w-0">
			<Text
				as={projectPage() ? "span" : "h1"}
				tone={projectPage() ? "default" : "strong"}
				weight={projectPage() ? "regular" : "medium"}
				truncate
				class="shrink-0"
			>
				{sectionTitle(location.pathname)}
			</Text>
			<Show when={projectPage()}>
				<Text as="span" tone="subtle" aria-hidden="true">
					/
				</Text>
				<Loading fallback={<span />}>
					<Row gap={2} class="min-w-0">
						<h1 class="min-w-0">
							<ProjectSwitcher />
						</h1>
						<Show when={workspace.activeSlug()}>
							<Text
								as="span"
								size="caption"
								tone="subtle"
								tabular
								class="hidden shrink-0 whitespace-nowrap sm:inline"
							>
								{workspace.tasks().length} task{workspace.tasks().length === 1 ? "" : "s"}
							</Text>
						</Show>
					</Row>
				</Loading>
			</Show>
		</Row>
	);
}

/**
 * The phone header's one action, in thumb reach and the same on every screen: a new thread. A
 * screen's own actions (a new task, a new note) sit in its pane header.
 */
function PhoneAction(): JSX.Element {
	const workspace = useWorkspace();
	const navigate = useNavigate();

	return (
		<IconButton
			label="New thread"
			variant="secondary"
			shape="round"
			size="lg"
			onClick={() => {
				const slug = workspace.currentSlug();
				navigate(slug ? `/chat/${slug}` : "/chat");
			}}
		>
			<EditIcon />
		</IconButton>
	);
}

/** The desktop top bar (52px, the Figma Top bar): the screen's tabs, or the breadcrumb. */
export function TitleBar(): JSX.Element {
	const shell = useShell();

	return (
		<header class="flex h-13 shrink-0 select-none items-center gap-2 border-line border-b pr-3 pl-5">
			<div class="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none]">
				<Show when={shell.tabs()} fallback={<Breadcrumb />}>
					{(tabs) => <>{tabs()()}</>}
				</Show>
			</div>
		</header>
	);
}

/**
 * The phone header (the Figma mobile header): a round button for the drawer, where you are in
 * the middle, and a round button for a new thread — 44px each, 16px from the edges.
 */
export function TopBar(): JSX.Element {
	const shell = useShell();
	const location = useLocation();

	return (
		<header class="z-30 shrink-0 bg-surface pt-safe">
			<Row gap={2} class="h-16 px-4">
				<IconButton
					label="Open navigation"
					aria-haspopup="dialog"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={() => shell.setDrawerOpen(true)}
				>
					<SidebarIcon />
				</IconButton>
				<div class="flex min-w-0 flex-1 items-center justify-center overflow-x-auto [scrollbar-width:none]">
					<Show
						when={shell.tabs()}
						fallback={
							<Show
								when={PROJECT_PAGE.test(location.pathname)}
								fallback={
									<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
										{sectionTitle(location.pathname)}
									</Text>
								}
							>
								<Loading fallback={<span />}>
									<h1 class="min-w-0">
										<ProjectSwitcher />
									</h1>
								</Loading>
							</Show>
						}
					>
						{(tabs) => <>{tabs()()}</>}
					</Show>
				</div>
				<PhoneAction />
			</Row>
		</header>
	);
}
