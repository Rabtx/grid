import { describe, expect, it } from "bun:test";

import { RICH_REPLIES_NOTE, readBlocks, splitReply, VISUAL_FENCE, VisualError } from "./index";

const fence = (json: string) => `\`\`\`${VISUAL_FENCE}\n${json}\n\`\`\``;

describe("the richer blocks", () => {
	it("keeps progress, timeline, donut and facts blocks as given", () => {
		expect(
			readBlocks([
				{ type: "progress", items: [{ label: "Coverage", value: 82, tone: "success" }] },
				{ type: "timeline", items: [{ time: "Mon", title: "Shipped", detail: " v2 " }] },
				{ type: "donut", total: "12", items: [{ label: "Bugs", value: 4 }] },
				{ type: "facts", items: [{ label: "Node", value: "22.4" }] },
			]),
		).toEqual([
			{ type: "progress", items: [{ label: "Coverage", value: 82, tone: "success" }] },
			{ type: "timeline", items: [{ time: "Mon", title: "Shipped", detail: "v2" }] },
			{ type: "donut", total: "12", items: [{ label: "Bugs", value: 4 }] },
			{ type: "facts", items: [{ label: "Node", value: "22.4" }] },
		]);
	});

	it("names what is wrong with them", () => {
		expect(() =>
			readBlocks([{ type: "progress", items: [{ label: "x", value: 1, max: 0 }] }]),
		).toThrow("blocks[0].items[0].max must be above 0");
		expect(() => readBlocks([{ type: "donut", items: [{ label: "x", value: 0 }] }])).toThrow(
			VisualError,
		);
	});
});

describe("splitReply", () => {
	it("leaves a reply without fences as one piece of text", () => {
		expect(splitReply("Plain *markdown*")).toEqual([{ kind: "text", text: "Plain *markdown*" }]);
	});

	it("draws each fence where it stands in the text", () => {
		const parts = splitReply(
			[
				"Here is the breakdown.",
				"",
				fence('{"title":"Split","blocks":[{"type":"facts","items":[{"label":"a","value":"b"}]}]}'),
				"",
				"That is all.",
			].join("\n"),
		);
		expect(parts.map((part) => part.kind)).toEqual(["text", "visual", "text"]);
		expect(parts[1]).toMatchObject({
			visual: { title: "Split", format: "components", blocks: [{ type: "facts" }] },
		});
	});

	it("takes a bare list of blocks, and gives a fence without a title a name", () => {
		expect(splitReply(fence('[{"type":"markdown","text":"hi"}]'))).toEqual([
			{
				kind: "visual",
				visual: {
					title: "Visual",
					format: "components",
					blocks: [{ type: "markdown", text: "hi" }],
				},
			},
		]);
	});

	it("waits on a fence still being written, and says why a bad one cannot be drawn", () => {
		expect(splitReply(`Working…\n\`\`\`${VISUAL_FENCE}\n{"title":`)).toEqual([
			{ kind: "text", text: "Working…" },
			{ kind: "pending" },
		]);
		expect(splitReply(fence('{"title":"x","blocks":[{"type":"pie"}]}'))).toEqual([
			{
				kind: "invalid",
				source: '{"title":"x","blocks":[{"type":"pie"}]}',
				error: 'blocks[0].type "pie" is not a block Grid draws',
			},
		]);
		expect(splitReply(fence("{oops"))[0]).toMatchObject({ kind: "invalid" });
	});

	it("ignores other code fences, and closes only on a matching fence", () => {
		const reply = ["```json", '{"a":1}', "```"].join("\n");
		expect(splitReply(reply)).toEqual([{ kind: "text", text: reply }]);
		const long = splitReply(
			[`~~~~${VISUAL_FENCE}`, '[{"type":"markdown","text":"```"}]', "```", "~~~~"].join("\n"),
		);
		expect(long[0]).toMatchObject({ kind: "invalid" });
	});
});

describe("RICH_REPLIES_NOTE", () => {
	it("teaches the fence with an example that checks out", () => {
		expect(RICH_REPLIES_NOTE).toContain(`\`\`\`${VISUAL_FENCE}`);
		const example = RICH_REPLIES_NOTE.slice(RICH_REPLIES_NOTE.indexOf("```"));
		const parts = splitReply(example.slice(0, example.indexOf("```", 3) + 3));
		expect(parts[0]?.kind).toBe("visual");
	});
});
