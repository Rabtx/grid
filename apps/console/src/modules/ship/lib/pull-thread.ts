import { queueFirstMessage } from "@/modules/chat/components/conversation";
import { chatService } from "@/modules/chat/services/chat.service";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { threadsStore } from "@/modules/chat/stores/threads";
import { placementsStore } from "@/modules/environments";
import { notesStore } from "@/modules/projects";

/**
 * Start a thread on a pull request's own branch, in a worktree of its own, with its first message
 * ready: testing a preview, say. It runs on the machine the project lives on, with the first agent
 * offered there. Returns the thread's id.
 */
export async function startPullThread(
	token: string,
	project: string,
	folder: string,
	pull: { number: number; branch: string },
	message: string,
): Promise<string> {
	const scope = placementsStore.scopeOf(project);
	await providersStore.load(token, scope);
	const provider = offeredProviders(providersStore.providers(scope))[0];
	if (!provider) throw new Error("No agent is installed on the machine this project runs on");
	const session = await chatService.create(
		token,
		{
			project,
			provider: provider.id,
			cwd: folder,
			model: provider.settings?.model,
			mode: provider.settings?.mode,
			worktree: true,
			branch: pull.branch,
			existing: true,
			pull: pull.number,
			notes: await notesStore.sharedText(token, project, provider.id),
		},
		scope,
	);
	queueFirstMessage(session.id, message);
	threadsStore.upsert(session);
	return session.id;
}
