/**
 * The agent a new chat starts with, remembered per device: the last one picked in the chat, or one
 * picked elsewhere for the next chat (a task's "Start with…"). Storage can be blocked; then the
 * workspace's default agent is used.
 */
export const AGENT_KEY = "grid.chat.agent";

export function rememberAgent(id: string): void {
	try {
		localStorage.setItem(AGENT_KEY, id);
	} catch {
		// Not remembered; the next chat starts with the workspace's default agent.
	}
}
