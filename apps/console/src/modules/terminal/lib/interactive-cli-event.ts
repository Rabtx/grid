/** Interpreted VT state from the runner; raw terminal output is delivered separately. */
export type InteractiveCliEvent =
	| { type: "text"; text: string }
	| { type: "status"; status: string }
	| { type: "selection"; options: string[] }
	| { type: "question"; text: string }
	| { type: "confirmation"; text: string }
	| { type: "ad"; content: string }
	| { type: "screen"; content: string }
	| { type: "error"; message: string };
