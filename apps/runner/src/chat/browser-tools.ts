import {
	BROWSER_KEYS,
	type Browsers,
	type PageSnapshot,
	type PageState,
} from "../browser/browsers";
import type { ChatSessionRow } from "./store";
import type { GridTool } from "./hub";

/**
 * Grid's browser, for agents: a page of their thread's own that they open, read, click and type
 * into, which the people in the thread watch (and can use) in the browser pane. Each action
 * answers with what the page shows next, numbered, so the agent rarely has to ask again.
 */

const SNAPSHOT_TEXT_CHARS = 4_000;

function describe(snapshot: PageSnapshot): string {
	const elements = snapshot.elements.length
		? snapshot.elements.join("\n")
		: "(nothing on the page can be clicked or typed into)";
	const text = snapshot.text.trim().slice(0, SNAPSHOT_TEXT_CHARS);
	return [
		`Page: ${snapshot.title || "(untitled)"} — ${snapshot.url}`,
		"",
		"Elements (use their numbers with browser_click and browser_type):",
		elements,
		"",
		"Text:",
		text || "(no text)",
	].join("\n");
}

function number(value: unknown, name: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
		throw new Error(`Say which element by its number (${name})`);
	return value;
}

export function browserTools(
	browsers: Browsers,
	/** A thread's page opened or moved to another address: the console shows the browser pane. */
	onNavigate: (session: ChatSessionRow, state: PageState) => void = () => undefined,
): GridTool[] {
	const after = async (session: ChatSessionRow, state: PageState, opened = false) => {
		if (opened) onNavigate(session, state);
		return describe(await browsers.snapshot(session.id));
	};
	const offered = () => browsers.available();
	return [
		{
			name: "browser_open",
			description:
				"Open a web page in Grid's browser, a real Chromium the people in this thread can watch and use beside the chat. Use it to check a site or the app you are building (localhost works), then read, click and type with the other browser_ tools. Answers with the page's numbered elements and text.",
			inputSchema: {
				type: "object",
				properties: {
					url: { type: "string", description: "The address, e.g. http://localhost:3000" },
				},
				required: ["url"],
			},
			offered,
			run: async (session, args) => {
				if (typeof args.url !== "string") throw new Error("Say which address to open");
				return after(session, await browsers.navigate(session.id, args.url), true);
			},
		},
		{
			name: "browser_snapshot",
			description: "Read the browser's page again: its address, numbered elements and text.",
			inputSchema: { type: "object", properties: {} },
			offered,
			run: async (session) => describe(await browsers.snapshot(session.id)),
		},
		{
			name: "browser_click",
			description: "Click an element of the browser's page, by its number from the last answer.",
			inputSchema: {
				type: "object",
				properties: { ref: { type: "integer", minimum: 1 } },
				required: ["ref"],
			},
			offered,
			run: async (session, args) => {
				const before = browsers.state(session.id).url;
				const state = await browsers.click(session.id, number(args.ref, "ref"));
				return after(session, state, state.url !== before);
			},
		},
		{
			name: "browser_type",
			description:
				"Type into a field of the browser's page, by its number (emptied first); submit presses Enter after.",
			inputSchema: {
				type: "object",
				properties: {
					ref: { type: "integer", minimum: 1 },
					text: { type: "string" },
					submit: { type: "boolean" },
				},
				required: ["ref", "text"],
			},
			offered,
			run: async (session, args) => {
				if (typeof args.text !== "string") throw new Error("Say what to type");
				const before = browsers.state(session.id).url;
				const state = await browsers.type(session.id, args.text, {
					ref: number(args.ref, "ref"),
					submit: args.submit === true,
				});
				return after(session, state, state.url !== before);
			},
		},
		{
			name: "browser_press",
			description: `Press a key on the browser's page: ${BROWSER_KEYS.filter((key) => key !== " ").join(", ")} or " " (space).`,
			inputSchema: {
				type: "object",
				properties: { key: { type: "string", enum: BROWSER_KEYS } },
				required: ["key"],
			},
			offered,
			run: async (session, args) => {
				if (typeof args.key !== "string") throw new Error("Say which key");
				const before = browsers.state(session.id).url;
				const state = await browsers.press(session.id, args.key);
				return after(session, state, state.url !== before);
			},
		},
		{
			name: "browser_scroll",
			description: "Scroll the browser's page down (or up) by about a screen, or by `pixels`.",
			inputSchema: {
				type: "object",
				properties: {
					direction: { type: "string", enum: ["down", "up"] },
					pixels: { type: "integer", minimum: 1, maximum: 10_000 },
				},
			},
			offered,
			run: async (session, args) => {
				const by = typeof args.pixels === "number" ? args.pixels : 700;
				return after(
					session,
					await browsers.scroll(session.id, args.direction === "up" ? -by : by),
				);
			},
		},
		{
			name: "browser_back",
			description: "Go back to the browser's previous page.",
			inputSchema: { type: "object", properties: {} },
			offered,
			run: async (session) => after(session, await browsers.back(session.id), true),
		},
		{
			name: "browser_screenshot",
			description:
				"See the browser's page as it looks: a picture, for layout and visual checks the text cannot tell.",
			inputSchema: { type: "object", properties: {} },
			offered,
			run: async (session) => {
				const state = browsers.state(session.id);
				if (!state.open) throw new Error("Open a page with browser_open first");
				const image = await browsers.screenshot(session.id);
				return { text: `${state.title || "(untitled)"} — ${state.url}`, image };
			},
		},
	];
}
