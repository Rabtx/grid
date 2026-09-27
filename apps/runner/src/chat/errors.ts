/**
 * What an agent's own words say about a failed turn: the model it was asked for no longer
 * exists, or the provider is too busy to answer. Both end with something the person can do;
 * everything else is left exactly as the agent said it.
 */
export type TurnErrorKind = "model-gone" | "provider-busy";

// opencode retires a free model behind a notice of its own, with no word for the model in it:
// "Thank you for participating in the Stealth … testing period". Only the two together count.
const RETIRED_NOTICE = /\bstealth\b[^\n]{0,80}\btesting period\b/i;

const MODEL_GONE: RegExp[] = [
	// "model not found", "the model is not available", "model no longer offered"
	/\bmodel\b[^.!\n]{0,60}\bnot\s+(?:found|listed|available|offered|recognized)\b/i,
	/\bmodel\b[^.!\n]{0,60}\bno longer\s+(?:available|offered|listed|supported)\b/i,
	/\bmodel\b[^.!\n]{0,60}\b(?:does not exist|doesn't exist|unrecognized|deprecated|retired)\b/i,
	// "unknown model", "no such model"
	/\b(?:unknown|unrecognized|deprecated|retired|non[- ]existent)\s+model\b/i,
	/\bno such model\b/i,
	RETIRED_NOTICE,
];

const PROVIDER_BUSY: RegExp[] = [
	/\bat capacity\b/i,
	/\brate[-\s]?limit(?:ed|ing)?\b/i,
	/\btoo many requests\b/i,
	/\boverload(?:ed)?\b/i,
	/\bhigh demand\b/i,
	/\btemporarily\s+(?:not\s+available|unavailable)\b/i,
	/\b(?:server|provider|model)\s+(?:is\s+)?busy\b/i,
];

/**
 * Which kind of failure this is, or null when the agent's text says nothing we can act on. Busy
 * is asked first: "the model is temporarily not available" is a model that is still there.
 */
export function turnErrorKind(error: string): TurnErrorKind | null {
	if (PROVIDER_BUSY.some((pattern) => pattern.test(error))) return "provider-busy";
	if (MODEL_GONE.some((pattern) => pattern.test(error))) return "model-gone";
	return null;
}

/** The agent's notice that it retired a model it may still list (opencode's free models). */
export function isRetiredNotice(error: string): boolean {
	return RETIRED_NOTICE.test(error);
}

/** Whether sending the same message again can work: after a busy provider, or a gone model. */
export function turnRetryable(kind: TurnErrorKind | null): boolean {
	return kind !== null;
}

/**
 * The turn's error as it is shown: one plain line saying whose fault it is and what to do, then
 * the agent's own text under it, untouched — the detail is never hidden.
 */
export function turnErrorMessage(
	kind: TurnErrorKind,
	provider: string,
	model: string | null,
	detail: string,
): string {
	const plain =
		kind === "model-gone"
			? `${model ? `This model (${model})` : "This model"} is no longer offered by ${provider}. Pick another, then send it again.`
			: `${provider} is busy: this is on the provider's side, not yours. Try again in a moment, or pick another model.`;
	return `${plain}\n\n${detail}`;
}
