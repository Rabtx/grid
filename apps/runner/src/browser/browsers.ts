import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { type Cdp, CdpError, findBrowser, launchBrowser } from "./cdp";

/**
 * One browser page per thread, shared by the thread's agent and the people looking at it: the
 * agent drives it with Grid's browser tools, the console's browser pane shows it and can click and
 * type into it too. Every thread's page is its own browser context (cookies, storage), all in one
 * headless Chromium on this machine, started on the first page and stopped when none are left.
 */

export const VIEWPORT = { width: 1280, height: 800 } as const;
const LOAD_TIMEOUT_MS = 15_000;
const SETTLE_MS = 250;
// A browser with no pages left is stopped after this long.
const IDLE_MS = 10 * 60_000;
const TEXT_LIMIT = 8_000;
const ELEMENT_LIMIT = 200;

export type PageState = {
	open: boolean;
	url: string;
	title: string;
	/** Goes up with every navigation or action, so a viewer knows its frame is old. */
	version: number;
};

export type PageSnapshot = { url: string; title: string; elements: string[]; text: string };

type Page = {
	context: string;
	target: string;
	session: string;
	url: string;
	title: string;
	version: number;
};

export class BrowserError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
	}
}

// Runs in the page: number what can be acted on (kept on the elements as `data-grid-ref`), and the
// page's text, so an agent can say "click 4" without guessing selectors.
const SNAPSHOT_SCRIPT = `(() => {
	for (const el of document.querySelectorAll("[data-grid-ref]")) el.removeAttribute("data-grid-ref");
	const selector = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[contenteditable=""],[contenteditable=true],[onclick]';
	const elements = [];
	let n = 0;
	for (const el of document.querySelectorAll(selector)) {
		const box = el.getBoundingClientRect();
		const style = getComputedStyle(el);
		if (box.width < 1 || box.height < 1 || style.visibility === "hidden" || style.display === "none") continue;
		if (n >= ${ELEMENT_LIMIT}) break;
		n++;
		el.setAttribute("data-grid-ref", String(n));
		const tag = el.tagName.toLowerCase();
		const role = el.getAttribute("role") || (tag === "a" ? "link" : tag === "input" ? (el.type || "text") + " field" : tag);
		const name = (el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || el.title || el.name || "").trim().replace(/\\s+/g, " ").slice(0, 80);
		const href = tag === "a" ? el.getAttribute("href") : null;
		elements.push("[" + n + "] " + role + (name ? ' "' + name + '"' : "") + (href ? " -> " + href : ""));
	}
	const text = (document.body ? document.body.innerText : "").replace(/\\n{3,}/g, "\\n\\n").slice(0, ${TEXT_LIMIT});
	return JSON.stringify({ url: location.href, title: document.title, elements, text });
})()`;

const KEYS: Record<string, { code: string; keyCode: number; text?: string }> = {
	Enter: { code: "Enter", keyCode: 13, text: "\r" },
	Tab: { code: "Tab", keyCode: 9 },
	Backspace: { code: "Backspace", keyCode: 8 },
	Delete: { code: "Delete", keyCode: 46 },
	Escape: { code: "Escape", keyCode: 27 },
	ArrowUp: { code: "ArrowUp", keyCode: 38 },
	ArrowDown: { code: "ArrowDown", keyCode: 40 },
	ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
	ArrowRight: { code: "ArrowRight", keyCode: 39 },
	Home: { code: "Home", keyCode: 36 },
	End: { code: "End", keyCode: 35 },
	PageUp: { code: "PageUp", keyCode: 33 },
	PageDown: { code: "PageDown", keyCode: 34 },
	" ": { code: "Space", keyCode: 32, text: " " },
};

export const BROWSER_KEYS = Object.keys(KEYS);

/** A web address as given, or with https:// in front; only http(s) and about:blank are opened. */
export function readUrl(raw: string): string {
	const text = raw.trim();
	if (text === "about:blank") return text;
	// "localhost:3000" is a host and port, not a scheme; "javascript:" and the like are schemes.
	const hasScheme =
		/^[a-z][\w+.-]*:\/\//i.test(text) ||
		/^(javascript|data|file|about|mailto|blob|chrome|view-source):/i.test(text);
	const local = /^(localhost|127\.|\[::1\])/.test(text);
	const withScheme = hasScheme ? text : `${local ? "http" : "https"}://${text}`;
	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		throw new BrowserError("That is not a web address");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:")
		throw new BrowserError("Only http and https pages open in Grid's browser");
	return url.toString();
}

export class Browsers {
	private browser: Promise<{ cdp: Cdp; stop: () => void }> | null = null;
	private readonly pages = new Map<string, Promise<Page>>();
	private readonly known = new Map<string, Page>();
	private idle: ReturnType<typeof setTimeout> | undefined;
	private readonly listeners = new Set<(thread: string, state: PageState) => void>();

	constructor(
		private readonly profileDir: string,
		private readonly binary: string | null = findBrowser(),
	) {}

	available(): boolean {
		return this.binary !== null;
	}

	/** Hear when a thread's page moves on (navigates, finishes loading, changes title). */
	onChange(listener: (thread: string, state: PageState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	state(thread: string): PageState {
		const page = this.known.get(thread);
		return page
			? { open: true, url: page.url, title: page.title, version: page.version }
			: { open: false, url: "", title: "", version: 0 };
	}

	async navigate(thread: string, raw: string): Promise<PageState> {
		const url = readUrl(raw);
		const { cdp, page } = await this.page(thread);
		const loaded = cdp.waitFor("Page.loadEventFired", page.session, LOAD_TIMEOUT_MS);
		const answer = await cdp.send<{ errorText?: string }>("Page.navigate", { url }, page.session);
		if (answer.errorText) throw new BrowserError(`The page did not open: ${answer.errorText}`, 502);
		await loaded;
		return this.touched(thread, page);
	}

	async back(thread: string): Promise<PageState> {
		const { cdp, page } = await this.page(thread);
		const history = await cdp.send<{ currentIndex: number; entries: { id: number }[] }>(
			"Page.getNavigationHistory",
			{},
			page.session,
		);
		const previous = history.entries[history.currentIndex - 1];
		if (!previous) throw new BrowserError("There is no page before this one");
		// A page kept in the back-forward cache comes back without loading again.
		const loaded = cdp.waitFor(
			["Page.loadEventFired", "Page.frameNavigated", "Page.navigatedWithinDocument"],
			page.session,
			LOAD_TIMEOUT_MS,
		);
		await cdp.send("Page.navigateToHistoryEntry", { entryId: previous.id }, page.session);
		await loaded;
		await Bun.sleep(SETTLE_MS);
		return this.touched(thread, page);
	}

	async reload(thread: string): Promise<PageState> {
		const { cdp, page } = await this.page(thread);
		const loaded = cdp.waitFor("Page.loadEventFired", page.session, LOAD_TIMEOUT_MS);
		await cdp.send("Page.reload", {}, page.session);
		await loaded;
		return this.touched(thread, page);
	}

	/** What is on the page: its numbered elements and its text. */
	async snapshot(thread: string): Promise<PageSnapshot> {
		const { page } = await this.page(thread);
		return JSON.parse(await this.evaluate(page, SNAPSHOT_SCRIPT)) as PageSnapshot;
	}

	/** Click an element from the last snapshot, by its number. */
	async click(thread: string, ref: number): Promise<PageState> {
		const { page } = await this.page(thread);
		const point = await this.locate(page, ref);
		return this.clickAt(thread, point.x, point.y);
	}

	/** Click a point on the page, in viewport pixels (a person clicking the pane). */
	async clickAt(thread: string, x: number, y: number): Promise<PageState> {
		const { cdp, page } = await this.page(thread);
		const at = {
			x: Math.max(0, Math.min(VIEWPORT.width - 1, x)),
			y: Math.max(0, Math.min(VIEWPORT.height - 1, y)),
		};
		await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at }, page.session);
		for (const type of ["mousePressed", "mouseReleased"])
			await cdp.send(
				"Input.dispatchMouseEvent",
				{ type, ...at, button: "left", clickCount: 1 },
				page.session,
			);
		await Bun.sleep(SETTLE_MS);
		return this.touched(thread, page);
	}

	/** Type into an element from the last snapshot (emptied first), or wherever the focus is. */
	async type(
		thread: string,
		text: string,
		options: { ref?: number; submit?: boolean } = {},
	): Promise<PageState> {
		const { cdp, page } = await this.page(thread);
		if (options.ref !== undefined) {
			const ok = await this.evaluate(
				page,
				`(() => { const el = document.querySelector('[data-grid-ref="${options.ref}"]'); if (!el) return "missing"; el.scrollIntoView({ block: "center" }); el.focus(); if ("value" in el && el.tagName !== "SELECT") { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); } return "ok"; })()`,
			);
			if (ok !== "ok")
				throw new BrowserError(`There is no element ${options.ref}; take a snapshot first`);
		}
		if (text) await cdp.send("Input.insertText", { text }, page.session);
		if (options.submit) return this.press(thread, "Enter");
		return this.touched(thread, page);
	}

	async press(thread: string, key: string): Promise<PageState> {
		const { cdp, page } = await this.page(thread);
		const known = KEYS[key];
		if (!known) throw new BrowserError(`Grid's browser cannot press ${key}`);
		const base = { key, code: known.code, windowsVirtualKeyCode: known.keyCode };
		await cdp.send(
			"Input.dispatchKeyEvent",
			{
				type: known.text ? "keyDown" : "rawKeyDown",
				...base,
				...(known.text ? { text: known.text } : {}),
			},
			page.session,
		);
		await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base }, page.session);
		await Bun.sleep(SETTLE_MS);
		return this.touched(thread, page);
	}

	/** Scroll the page by this many pixels down (negative: up). */
	async scroll(thread: string, by: number): Promise<PageState> {
		const { cdp, page } = await this.page(thread);
		await cdp.send(
			"Input.dispatchMouseEvent",
			{ type: "mouseWheel", x: VIEWPORT.width / 2, y: VIEWPORT.height / 2, deltaX: 0, deltaY: by },
			page.session,
		);
		await Bun.sleep(SETTLE_MS);
		return this.touched(thread, page);
	}

	/** The page as it looks now. */
	async screenshot(
		thread: string,
		format: "jpeg" | "png" = "jpeg",
	): Promise<{ data: string; mimeType: string }> {
		const { cdp, page } = await this.page(thread);
		const shot = await cdp.send<{ data: string }>(
			"Page.captureScreenshot",
			{ format, ...(format === "jpeg" ? { quality: 70 } : {}) },
			page.session,
		);
		return { data: shot.data, mimeType: `image/${format}` };
	}

	/** Close a thread's page (its cookies go with it); the browser stops once none are left. */
	async close(thread: string): Promise<void> {
		const opening = this.pages.get(thread);
		this.pages.delete(thread);
		this.known.delete(thread);
		this.emit(thread, this.state(thread));
		const page = await opening?.catch(() => null);
		const browser = await this.browser?.catch(() => null);
		if (page && browser?.cdp.open)
			await browser.cdp
				.send("Target.disposeBrowserContext", { browserContextId: page.context })
				.catch(() => undefined);
		this.armIdle();
	}

	shutdown(): void {
		clearTimeout(this.idle);
		const browser = this.browser;
		this.browser = null;
		this.pages.clear();
		this.known.clear();
		void browser?.then((running) => running.stop()).catch(() => undefined);
	}

	private emit(thread: string, state: PageState): void {
		for (const listener of this.listeners) listener(thread, state);
	}

	/** After an action: read where the page is now and what it is called, and say it moved on. */
	private async touched(thread: string, page: Page): Promise<PageState> {
		const where = await this.evaluate(
			page,
			"JSON.stringify([location.href, document.title])",
		).catch(() => "");
		if (where) {
			const [url, title] = JSON.parse(where) as [string, string];
			page.url = url;
			page.title = title;
		}
		page.version++;
		const state = this.state(thread);
		this.emit(thread, state);
		return state;
	}

	private async evaluate(page: Page, expression: string): Promise<string> {
		const { cdp } = await this.running();
		const answer = await cdp.send<{
			result?: { value?: unknown };
			exceptionDetails?: { text?: string };
		}>("Runtime.evaluate", { expression, returnByValue: true }, page.session);
		if (answer.exceptionDetails)
			throw new BrowserError(answer.exceptionDetails.text ?? "The page's script failed");
		return String(answer.result?.value ?? "");
	}

	private async locate(page: Page, ref: number): Promise<{ x: number; y: number }> {
		const raw = await this.evaluate(
			page,
			`(() => { const el = document.querySelector('[data-grid-ref="${Number(ref)}"]'); if (!el) return ""; el.scrollIntoView({ block: "center", inline: "center" }); const box = el.getBoundingClientRect(); return JSON.stringify({ x: box.left + box.width / 2, y: box.top + box.height / 2 }); })()`,
		);
		if (!raw) throw new BrowserError(`There is no element ${ref}; take a snapshot first`);
		return JSON.parse(raw) as { x: number; y: number };
	}

	private running(): Promise<{ cdp: Cdp; stop: () => void }> {
		if (!this.binary)
			return Promise.reject(
				new BrowserError("No Chromium on this machine; install Chrome or set GRID_BROWSER", 501),
			);
		if (this.browser) return this.browser;
		mkdirSync(this.profileDir, { recursive: true, mode: 0o700 });
		const binary = this.binary;
		const starting = launchBrowser(binary, this.profileDir).then((running) => {
			running.cdp.on((method, params, session) => this.heard(method, params, session));
			void running.cdp.send("Target.setDiscoverTargets", { discover: true }).catch(() => undefined);
			return running;
		});
		this.browser = starting;
		starting.catch(() => {
			if (this.browser === starting) this.browser = null;
		});
		return starting;
	}

	private async page(thread: string): Promise<{ cdp: Cdp; page: Page }> {
		clearTimeout(this.idle);
		const browser = await this.running();
		if (!browser.cdp.open) {
			// The browser went away (crashed, killed): start again with fresh pages.
			this.browser = null;
			this.pages.clear();
			this.known.clear();
			return this.page(thread);
		}
		let opening = this.pages.get(thread);
		if (!opening) {
			opening = this.openPage(browser.cdp);
			this.pages.set(thread, opening);
			opening.then(
				(page) => this.known.set(thread, page),
				() => this.pages.delete(thread),
			);
		}
		return { cdp: browser.cdp, page: await opening };
	}

	private async openPage(cdp: Cdp): Promise<Page> {
		const { browserContextId } = await cdp.send<{ browserContextId: string }>(
			"Target.createBrowserContext",
			{ disposeOnDetach: false },
		);
		const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", {
			url: "about:blank",
			browserContextId,
			...VIEWPORT,
		});
		const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", {
			targetId,
			flatten: true,
		});
		await cdp.send("Page.enable", {}, sessionId);
		await cdp.send("Runtime.enable", {}, sessionId);
		await cdp.send(
			"Emulation.setDeviceMetricsOverride",
			{ ...VIEWPORT, deviceScaleFactor: 1, mobile: false },
			sessionId,
		);
		return {
			context: browserContextId,
			target: targetId,
			session: sessionId,
			url: "about:blank",
			title: "",
			version: 0,
		};
	}

	private heard(method: string, params: Record<string, unknown>, session?: string): void {
		if (method === "Target.targetInfoChanged") {
			const info = params.targetInfo as { targetId?: string; url?: string; title?: string };
			for (const [thread, page] of this.known) {
				if (page.target !== info.targetId) continue;
				page.url = info.url ?? page.url;
				page.title = info.title ?? page.title;
				page.version++;
				this.emit(thread, this.state(thread));
			}
			return;
		}
		// A page's alert or confirm would stop it until answered; nobody is there to, so accept.
		if (method === "Page.javascriptDialogOpening" && session) {
			void this.browser
				?.then(({ cdp }) => cdp.send("Page.handleJavaScriptDialog", { accept: true }, session))
				.catch(() => undefined);
		}
	}

	private armIdle(): void {
		clearTimeout(this.idle);
		if (this.pages.size > 0 || !this.browser) return;
		this.idle = setTimeout(() => {
			if (this.pages.size === 0) this.shutdown();
		}, IDLE_MS);
	}

	/** Forget the browser's profile folder (on sign-out of the machine, or in tests). */
	wipe(): void {
		this.shutdown();
		rmSync(join(this.profileDir), { recursive: true, force: true });
	}
}

export { CdpError };
