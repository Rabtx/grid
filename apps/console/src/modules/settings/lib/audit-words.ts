import type { AuditActorKind } from "../services/spend.service";

/** What an audit entry's action was, as a sentence starts: "Started", "Revoked agent key". */
const ACTIONS: Record<string, string> = {
	"thread.start": "Started",
	"thread.send": "Sent a message to",
	"thread.stop": "Stopped",
	"thread.answer": "Answered a question in",
	"key.create": "Made the agent key",
	"key.revoke": "Revoked the agent key",
	"guest_link.create": "Shared with a guest",
	"guest_link.stop": "Stopped sharing",
	"guest.ask": "Asked in",
	"guest.send": "Sent a guest's question on in",
	"guest.dismiss": "Dismissed a guest's question in",
	"automation.run": "Ran",
	"webhook.refused": "Refused a webhook delivery for",
	"budget.warning": "Warned:",
	"budget.reached": "Used up:",
};

export function actionWords(action: string): string {
	return ACTIONS[action] ?? action;
}

/** What kind of actor did it, for its line and the filter. */
export const ACTOR_KINDS: Record<AuditActorKind, string> = {
	person: "Person",
	agent_key: "Agent key",
	guest: "Guest",
	webhook: "Webhook",
	automation: "Automation",
	grid: "Grid",
};
