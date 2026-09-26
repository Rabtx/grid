import type { JSX } from "@solidjs/web";
import { createContext, createEffect, createMemo, createSignal, useContext } from "solid-js";

import { activeWorkspace, rememberWorkspace } from "@/lib/active-workspace";
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
};

const WorkspacesContext = createContext<WorkspacesState>();

/** Start the console again at its root, in whatever workspace is now remembered. */
function restart(): void {
	window.location.assign("/");
}

/**
 * The workspaces you belong to and the one you are in. Switching reloads the console, so each
 * screen only ever deals with one workspace and nothing from the last one lingers.
 */
export function WorkspacesProvider(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();
	const [createOpen, setCreateOpen] = createSignal(false);

	// Kept on the device like the projects, so the switcher shows names while the session is
	// confirmed on opening.
	const list = createMemo(async () => {
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

	// A workspace you have left, or that was renamed or deleted, falls back to your default.
	createEffect(
		() => (auth.token() ? list() : null),
		(workspaces) => {
			const chosen = activeWorkspace();
			if (!workspaces?.length || !chosen) return;
			if (workspaces.some((workspace) => workspace.slug === chosen)) return;
			rememberWorkspace(null);
			restart();
		},
	);

	const state: WorkspacesState = {
		list,
		current,
		switchTo: (workspace) => {
			if (workspace.slug === current()?.slug) return;
			rememberWorkspace(workspace.isDefault ? null : workspace.slug);
			restart();
		},
		create: async (input) => {
			const token = await auth.waitForToken();
			if (!token) throw new Error("Sign in again to create a workspace");
			const created = await workspacesService.create(token, input);
			rememberWorkspace(created.slug);
			restart();
		},
		createOpen,
		setCreateOpen,
	};

	return <WorkspacesContext value={state}>{props.children}</WorkspacesContext>;
}

export function useWorkspaces(): WorkspacesState {
	const workspaces = useContext(WorkspacesContext);
	if (!workspaces) throw new Error("useWorkspaces must be used inside WorkspacesProvider");
	return workspaces;
}
