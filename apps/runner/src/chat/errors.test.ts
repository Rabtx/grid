import { describe, expect, it } from "bun:test";

import { turnErrorMessage, turnErrorKind } from "./errors";

describe("a failed turn in words", () => {
	it("takes a model the agent refuses for what it is", () => {
		expect(turnErrorKind("model not found")).toBe("model-gone");
		expect(turnErrorKind("Model not found: 'claude-3-opus-20240229'")).toBe("model-gone");
		expect(turnErrorKind("No such model: 'gpt-x'")).toBe("model-gone");
		expect(turnErrorKind("The model is not available")).toBe("model-gone");
		expect(turnErrorKind("This model is no longer offered")).toBe("model-gone");
		expect(turnErrorKind("model 'grid-7' does not exist")).toBe("model-gone");
		expect(turnErrorKind("unknown model")).toBe("model-gone");
		expect(turnErrorKind("This model has been retired")).toBe("model-gone");
		// opencode retires a model behind a notice of its own, with no word for the model in it
		expect(
			turnErrorKind(
				"Internal error: Thank you for participating in the Stealth model testing period",
			),
		).toBe("model-gone");
	});

	it("takes a provider that is too busy for what it is", () => {
		expect(turnErrorKind("Selected model is at capacity. Please try a different model.")).toBe(
			"provider-busy",
		);
		expect(turnErrorKind("Rate limit exceeded, try again later")).toBe("provider-busy");
		expect(turnErrorKind("429 Too Many Requests")).toBe("provider-busy");
		expect(turnErrorKind("The provider is overloaded right now")).toBe("provider-busy");
		// Busy is asked first: a model that is not available for now is still there.
		expect(
			turnErrorKind("The model is temporarily not available due to high demand, overloaded"),
		).toBe("provider-busy");
	});

	it("leaves everything else alone", () => {
		// The agent is being fussy about our own run, not about a model that is gone.
		expect(
			turnErrorKind(
				'error: invalid model selection (--model "gemini-3.8-flash" --effort ""): --model gemini-3.8-flash requires --effort (available: low, medium, high)',
			),
		).toBeNull();
		expect(turnErrorKind("Exit code 1: something broke")).toBeNull();
		// About the message, not about a model that is gone.
		expect(turnErrorKind("This model does not support images: unknown content type")).toBeNull();
		expect(turnErrorKind("model output removed by content filter")).toBeNull();
		// Either word alone is ordinary text.
		expect(turnErrorKind("Deploy the stealth build")).toBeNull();
		expect(turnErrorKind("The trial is in its testing period")).toBeNull();
		expect(turnErrorKind("")).toBeNull();
	});

	it("writes the plain line first and the agent's own text under it", () => {
		const detail = "Selected model is at capacity. Please try a different model.";
		const busy = turnErrorMessage("provider-busy", "Codex", "o5", detail);
		expect(busy.split("\n\n")[0]).toBe(
			"Codex is busy: this is on the provider's side, not yours. Try again in a moment, or pick another model.",
		);
		expect(busy.endsWith(detail)).toBe(true);

		const gone = turnErrorMessage(
			"model-gone",
			"Antigravity",
			"gemini-3.8-flash",
			"model not found",
		);
		expect(gone.split("\n\n")[0]).toBe(
			"This model (gemini-3.8-flash) is no longer offered by Antigravity. Pick another, then send it again.",
		);
		expect(gone.endsWith("model not found")).toBe(true);
		expect(
			turnErrorMessage("model-gone", "Antigravity", null, "model not found").split("\n\n")[0],
		).toBe("This model is no longer offered by Antigravity. Pick another, then send it again.");
	});
});
