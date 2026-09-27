/**
 * What an agent's own words say about a failed turn: the model it was asked for no longer
 * exists, or the provider is too busy to answer. Both end with something the person can do;
 * everything else is left exactly as the agent said it.
 */
export type TurnErrorKind = "model-gone" | "provider-busy";

const MODEL_GONE: RegExp[] = [
	// "model not found", "the model is not available", "model no longer offered"
	/\bmodel\b[^.!\n]{0,60}\bnot\s+(?:found|listed|available|offered|supported|recognized)\b/i,
	/\bmodel\b[^.!\n]{0,60}\bno longer\s+(?:available|offered|listed|supported)\b/i,
	/\bmodel\b[^.!\n]{0,60}\b(?:does not exist|doesn't exist|unknown|unrecognized|deprecated|retired|removed)\b/i,
	// "unknown model", "unsupported model", "no such model"
	/\b(?:unknown|unrecognized|unsupported|deprecated|retired|non[- ]existent)\s+model\b/i,
	/\bno such model\b/i,
	// opencode retires a model behind a notice of its own, with no word for the model in it
	/\bstealth\b/i,
	/\btesting period\b/i,
];

const PROVIDER_BUSY: RegExp[] = [
	/\bat capacity\b/i,
	/\brate[-\s]?limit(?:ed|ing)?\b/i,
	/\btoo many requests\b/i,
	/\boverload(?:ed)?\b/i,
	/\b(?:server|provider|model)\s+(?:is\s+)?busy\b/i,
];

/** Which kind of failure this is, or null when the agent's text says nothing we can act on. */
export function turnErrorKind(error: string): TurnErrorKind | null {
	if (MODEL_GONE.some((pattern) => pattern.test(error))) return "model-gone";
	if (PROVIDER_BUSY.some((pattern) => pattern.test(error))) return "provider-busy";
	return null;
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
