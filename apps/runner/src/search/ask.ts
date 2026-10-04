import { extractJson } from "../pulse/reading";

/** Something an answer may draw on, numbered for its citations. */
export type Source = {
	n: number;
	kind: "note" | "thread" | "task" | "commit" | "pull";
	title: string;
	/** "Note · Aug 12 · Shabir". */
	meta: string;
	/** Where it opens in the console, from the workspace's root. */
	href: string | null;
	/** What the agent reads of it. */
	text: string;
};

export type Answer = {
	answer: string;
	cited: number[];
	followUps: string[];
};

/** A question's words worth searching for: no small words, no stop words. */
const STOP = new Set(
	"the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use why what when where which with this that from they will would there their have been were into than then them these those about does doing your yours mine onto over under again did does done grid".split(
		" ",
	),
);

export function askWords(question: string): string[] {
	return [
		...new Set(
			question
				.toLowerCase()
				.split(/[^\p{L}\p{N}_-]+/u)
				.filter((word) => word.length >= 3 && !STOP.has(word)),
		),
	].slice(0, 8);
}

/** The message that asks an agent to answer only from the sources, citing them. */
export function askPrompt(
	question: string,
	sources: readonly Source[],
	history: readonly { question: string; answer: string }[] = [],
): string {
	return [
		"You answer questions about this company's own work for Grid, only from the sources below: notes, agent threads, tasks, commits and pull requests the person can already see.",
		"Do not use tools, do not read files, do not guess. If the sources do not answer it, say so plainly in one sentence.",
		"Cite every claim with the source's number in square brackets, like [2]. Write two or three short paragraphs at most, plain and direct.",
		...(history.length
			? [
					"",
					"Earlier in this conversation:",
					...history.flatMap((turn) => [`Q: ${turn.question}`, `A: ${turn.answer}`]),
				]
			: []),
		"",
		"Sources:",
		...sources.map((source) => `[${source.n}] ${source.title} (${source.meta})\n${source.text}`),
		"",
		`Question: ${question}`,
		"",
		'Answer with only JSON in one ```json block: {"answer": "…with [n] citations…", "cited": [1, 2], "followUps": ["three short follow-up questions"]}',
	].join("\n");
}

/** An agent's answer, or the text as it came when it is not the JSON asked for. */
export function parseAnswer(text: string, sources: readonly Source[]): Answer {
	const raw = extractJson(text) as {
		answer?: unknown;
		cited?: unknown;
		followUps?: unknown;
	} | null;
	const known = new Set(sources.map((source) => source.n));
	const answer =
		raw && typeof raw.answer === "string" && raw.answer.trim() ? raw.answer.trim() : text.trim();
	const cited = [
		...new Set(
			(Array.isArray(raw?.cited)
				? raw.cited
				: [...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]))
			)
				.map(Number)
				.filter((n) => known.has(n)),
		),
	];
	const followUps = (Array.isArray(raw?.followUps) ? raw.followUps : [])
		.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
		.map((item) => item.trim().slice(0, 120))
		.slice(0, 3);
	return { answer: answer.slice(0, 4000), cited, followUps };
}
