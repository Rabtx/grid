import type { JSX } from "@solidjs/web";
import {
	createContext,
	createEffect,
	createMemo,
	createSignal,
	Loading,
	Show,
	useContext,
} from "solid-js";

import { activeWorkspace, rememberWorkspace, urlWithWorkspace } from "@/lib/active-workspace";
import { localStore } from "@/lib/local-store";
import { useAuth } from "@/modules/auth";

import { workspacesService } from "../services/workspaces.service";
import type { CreateWorkspaceInput, Workspace } from "../types/workspace.types";

type WorkspacesState = {
	/** Every workspace you belong to. */
	list: () => Workspace[];
	/** The one this device works in: the chosen one, else your default. */
	current: () => Workspace | null;
	/** Work in another workspace; the console starts over there. */
	switchTo: (workspace: Workspace) => void;
	/** Make a workspace and move into it. */
	create: (input: CreateWorkspaceInput) => Promise<void>;
	createOpen: () => boolean;
	setCreateOpen: (open: boolean) => void;
	/** Read the list again, after a change made here (a rename, a setting, a logo). */
	refresh: () => void;
};

const WorkspacesContext = createContext<WorkspacesState>();

/** Open a workspace at its home, starting the console over there. */
export function openWorkspace(slug: string): void {
	rememberWorkspace(slug);
	window.location.assign(`/${encodeURIComponent(slug)}/`);
}

/**
 * The workspaces you belong to and the one you are in. Switching loads the other workspace's URL,
 * so each screen only ever deals with one workspace and nothing from the last one lingers.
 */
export function WorkspacesProvider(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();
	const [createOpen, setCreateOpen] = createSignal(false);
	const [revision, setRevision] = createSignal(0);

	// Kept on the device like the projects, so the switcher shows names while the session is
	// confirmed on opening.
	const list = createMemo(async () => {
		revision();
		const token = auth.token();
		if (!token) return (await localStore.get<Workspace[]>("workspaces")) ?? [];
		const workspaces = await workspacesService.list(token);
		void localStore.set("workspaces", workspaces);
		return workspaces;
	});

	const current = createMemo(() => {
		const workspaces = list();
		const chosen = activeWorkspace();
		return (
			workspaces.find((workspace) => workspace.slug === chosen) ??
			workspaces.find((workspace) => workspace.isDefault) ??
			workspaces[0] ??
			null
		);
	});

	// Once the list is in: a page opened before any workspace was known moves under your default
	// one, and a workspace you have left (or that was renamed or deleted) gives way to it.
	createEffect(
		() => (auth.token() ? list() : null),
		(workspaces) => {
			if (!workspaces?.length) return;
			const chosen = activeWorkspace();
			const fallback = workspaces.find((workspace) => workspace.isDefault) ?? workspaces[0];
			if (!chosen) {
				const moved = urlWithWorkspace(fallback.slug);
				if (moved) {
					rememberWorkspace(fallback.slug);
					window.location.replace(moved);
				}
				return;
			}
			if (!workspaces.some((workspace) => workspace.slug === chosen)) openWorkspace(fallback.slug);
		},
	);

	// Screens wait until the workspace in the URL is known to be yours: asking for a stranger's
	// projects would only fail, and the effect above is already taking you home.
	const known = createMemo(() => {
		const chosen = activeWorkspace();
		const workspaces = list();
		return !chosen || workspaces.length === 0 || workspaces.some((item) => item.slug === chosen);
	});

	const state: WorkspacesState = {
		list,
		current,
		switchTo: (workspace) => {
			if (workspace.slug !== current()?.slug) openWorkspace(workspace.slug);
		},
		create: async (input) => {
			const token = await auth.waitForToken();
			if (!token) throw new Error("Sign in again to create a workspace");
			const created = await workspacesService.create(token, input);
			openWorkspace(created.slug);
		},
		createOpen,
		setCreateOpen,
		refresh: () => setRevision((n) => n + 1),
	};

	return (
		<WorkspacesContext value={state}>
			<Loading fallback={null}>
				<Show when={known()}>{props.children}</Show>
			</Loading>
		</WorkspacesContext>
	);
}

export function useWorkspaces(): WorkspacesState {
	const workspaces = useContext(WorkspacesContext);
	if (!workspaces) throw new Error("useWorkspaces must be used inside WorkspacesProvider");
	return workspaces;
}
