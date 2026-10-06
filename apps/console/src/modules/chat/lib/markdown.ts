import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { Marked, type Tokens } from "marked";

// The languages agents write most; anything else is shown plain. Aliases (ts, sh, html…) come
// with each language.
for (const [name, language] of Object.entries({
	bash,
	css,
	diff,
	go,
	javascript,
	json,
	markdown: markdownLanguage,
	python,
	rust,
	sql,
	typescript,
	xml,
	yaml,
})) {
	hljs.registerLanguage(name, language);
}
hljs.registerAliases(["tsx", "jsx"], { languageName: "typescript" });
hljs.registerAliases(["shell", "zsh", "console"], { languageName: "bash" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// Agent output is not trusted: links may only go to the web or mail, never `javascript:`.
function safeHref(href: string): string | null {
	try {
		const url = new URL(href, window.location.origin);
		return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

// Backticked text that is a file path, maybe with a line: `src/theme/derive.ts:112`, `README.md`.
const FILE_PATH =
	/^(?:\.{0,2}\/|~\/)?(?:[\w@.-]+\/)*[\w@-][\w.@-]*\.[a-z][a-z0-9]{0,7}(?::\d+(?::\d+)?)?$/i;

/**
 * Markdown for agent replies. Raw HTML in the text is shown as text, not rendered, and links
 * are limited to safe schemes, so nothing an agent prints can run in the page.
 */
const markdown = new Marked({
	gfm: true,
	breaks: false,
	renderer: {
		codespan(token: Tokens.Codespan) {
			// A file the agent names reads as a file: a chip with a file mark (see .chat-prose).
			const kind = FILE_PATH.test(token.text.trim()) ? ' class="file-chip"' : "";
			return `<code${kind}>${escapeHtml(token.text)}</code>`;
		},
		html(token: Tokens.HTML | Tokens.Tag) {
			// Key caps are the one tag agents use that is harmless to keep; all else shows as text.
			if (/^<\/?kbd>$/i.test(token.text.trim())) return token.text.trim().toLowerCase();
			return escapeHtml(token.text);
		},
		link(token: Tokens.Link) {
			const href = safeHref(token.href);
			const text = this.parser.parseInline(token.tokens);
			if (!href) return text;
			return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
		},
		code(token: Tokens.Code) {
			// A card: the language and a copy button over numbered, highlighted lines. The copy button
			// works through `copyCodeFrom`, a delegated click handler, since this is rendered as HTML.
			const language = (token.lang ?? "").split(/\s/)[0].toLowerCase();
			const text = token.text.replace(/\n$/, "");
			const html =
				language && hljs.getLanguage(language)
					? hljs.highlight(text, { language, ignoreIllegals: true }).value
					: escapeHtml(text);
			const body = splitLines(html)
				.map((line) => `<span class="code-line">${line}</span>`)
				.join("\n");
			return `<figure class="code-block"><figcaption><span>${escapeHtml(language || "text")}</span><button type="button" data-copy-code aria-label="Copy code">Copy</button></figcaption><pre><code>${body}</code></pre></figure>`;
		},
		image(token: Tokens.Image) {
			// No remote images: they would load third-party content into the console.
			return escapeHtml(token.text || token.href);
		},
	},
});

function isSafeUrl(href: string): boolean {
	try {
		const trimmed = href.trim();
		if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./")) return true;
		const origin =
			typeof window !== "undefined" && window.location?.origin
				? window.location.origin
				: "http://localhost";
		const url = new URL(trimmed, origin);
		return ["http:", "https:", "mailto:"].includes(url.protocol);
	} catch {
		return false;
	}
}

function isSafeImageUrl(src: string): boolean {
	try {
		const trimmed = src.trim();
		if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("data:image/"))
			return true;
		const origin =
			typeof window !== "undefined" && window.location?.origin
				? window.location.origin
				: "http://localhost";
		const url = new URL(trimmed, origin);
		return ["http:", "https:"].includes(url.protocol);
	} catch {
		return false;
	}
}

const FORBIDDEN_TAGS = new Set([
	"applet",
	"base",
	"button",
	"embed",
	"form",
	"frame",
	"frameset",
	"iframe",
	"input",
	"link",
	"math",
	"meta",
	"object",
	"script",
	"select",
	"style",
	"svg",
	"template",
	"textarea",
]);

const ALLOWED_TAGS = new Set([
	"a",
	"abbr",
	"b",
	"blockquote",
	"br",
	"cite",
	"code",
	"dd",
	"del",
	"details",
	"dfn",
	"div",
	"dl",
	"dt",
	"em",
	"figcaption",
	"figure",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"i",
	"img",
	"ins",
	"kbd",
	"li",
	"mark",
	"ol",
	"p",
	"picture",
	"pre",
	"q",
	"s",
	"samp",
	"section",
	"small",
	"source",
	"span",
	"strike",
	"strong",
	"sub",
	"summary",
	"sup",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"time",
	"tr",
	"ul",
	"var",
	"wbr",
]);

const GLOBAL_ATTRS = new Set(["align", "class", "dir", "title"]);

const TAG_ATTRS: Record<string, Set<string>> = {
	a: new Set(["href", "rel", "target", "title"]),
	details: new Set(["open"]),
	img: new Set(["alt", "height", "loading", "src", "title", "width"]),
	ol: new Set(["reversed", "start", "type"]),
	td: new Set(["align", "colspan", "rowspan", "valign"]),
	th: new Set(["align", "colspan", "rowspan", "valign"]),
};

function sanitizeNode(node: Node): void {
	if (node.nodeType === 8) {
		// HTML comments are hidden
		node.parentNode?.removeChild(node);
		return;
	}
	if (node.nodeType === 1) {
		const element = node as Element;
		const tag = element.tagName.toLowerCase();

		if (FORBIDDEN_TAGS.has(tag)) {
			element.parentNode?.removeChild(element);
			return;
		}

		if (!ALLOWED_TAGS.has(tag)) {
			// Unwrap disallowed container tag: keep its children
			const parent = element.parentNode;
			if (parent) {
				while (element.firstChild) {
					parent.insertBefore(element.firstChild, element);
				}
				parent.removeChild(element);
			} else {
				element.remove();
			}
			return;
		}

		// Sanitize attributes: no scripts, event handlers, javascript: URLs, or style injection
		for (const attr of Array.from(element.attributes)) {
			const name = attr.name.toLowerCase();
			const val = attr.value;

			if (name.startsWith("on") || name === "style") {
				element.removeAttribute(attr.name);
				continue;
			}

			if (name === "href") {
				if (tag !== "a" || !isSafeUrl(val)) {
					element.removeAttribute(attr.name);
				} else {
					element.setAttribute("target", "_blank");
					element.setAttribute("rel", "noopener noreferrer");
				}
				continue;
			}

			if (name === "src") {
				if (tag !== "img" || !isSafeImageUrl(val)) {
					element.parentNode?.removeChild(element);
					return;
				}
				continue;
			}

			const allowedForTag = TAG_ATTRS[tag];
			if (!GLOBAL_ATTRS.has(name) && (!allowedForTag || !allowedForTag.has(name))) {
				element.removeAttribute(attr.name);
			}
		}

		for (const child of Array.from(element.childNodes)) {
			sanitizeNode(child);
		}
	}
}

/** Sanitize an HTML string, keeping safe GitHub-flavoured elements and attributes while preventing XSS. */
export function sanitizeHtml(html: string): string {
	const Parser =
		typeof DOMParser !== "undefined"
			? DOMParser
			: (globalThis as unknown as { DOMParser?: typeof DOMParser }).DOMParser;
	if (!Parser) return escapeHtml(html);
	const parser = new Parser();
	const doc = parser.parseFromString(html, "text/html");
	for (const child of Array.from(doc.body.childNodes)) {
		sanitizeNode(child);
	}
	return doc.body.innerHTML;
}

/**
 * Markdown for documents and pull request descriptions. Allows GitHub-flavoured inline HTML
 * (details/summary, img, br, tables, kbd, sub/sup), with sanitisation against scripts, event
 * handlers, javascript: URLs, and style injection.
 */
const documentMarkdown = new Marked({
	gfm: true,
	breaks: false,
	renderer: {
		codespan(token: Tokens.Codespan) {
			const kind = FILE_PATH.test(token.text.trim()) ? ' class="file-chip"' : "";
			return `<code${kind}>${escapeHtml(token.text)}</code>`;
		},
		html(token: Tokens.HTML | Tokens.Tag) {
			// Pass raw HTML through; it is sanitized by sanitizeHtml after parsing
			return token.text;
		},
		link(token: Tokens.Link) {
			const href = safeHref(token.href);
			const text = this.parser.parseInline(token.tokens);
			if (!href) return text;
			return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
		},
		code(token: Tokens.Code) {
			const language = (token.lang ?? "").split(/\s/)[0].toLowerCase();
			const text = token.text.replace(/\n$/, "");
			const html =
				language && hljs.getLanguage(language)
					? hljs.highlight(text, { language, ignoreIllegals: true }).value
					: escapeHtml(text);
			const body = splitLines(html)
				.map((line) => `<span class="code-line">${line}</span>`)
				.join("\n");
			return `<figure class="code-block"><figcaption><span>${escapeHtml(language || "text")}</span><button type="button" data-copy-code aria-label="Copy code">Copy</button></figcaption><pre><code>${body}</code></pre></figure>`;
		},
		image(token: Tokens.Image) {
			const href = isSafeImageUrl(token.href) ? token.href : null;
			if (!href) return escapeHtml(token.text || token.href);
			const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : "";
			return `<img src="${escapeHtml(href)}" alt="${escapeHtml(token.text)}"${titleAttr}>`;
		},
	},
});

/**
 * Highlighted HTML split into lines, each with its own balanced spans: a token that runs across
 * lines (a block comment, a template string) is closed at the end of one line and reopened on
 * the next, so every line can be wrapped for numbering.
 */
export function splitLines(html: string): string[] {
	const lines: string[] = [];
	const open: string[] = [];
	for (const raw of html.split("\n")) {
		let line = open.join("") + raw;
		for (const tag of raw.match(/<span[^>]*>|<\/span>/g) ?? []) {
			if (tag === "</span>") open.pop();
			else open.push(tag);
		}
		line += "</span>".repeat(open.length);
		lines.push(line);
	}
	return lines;
}

const EXTENSIONS: Record<string, string> = {
	ts: "typescript",
	tsx: "typescript",
	mts: "typescript",
	cts: "typescript",
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	json: "json",
	css: "css",
	html: "xml",
	svg: "xml",
	xml: "xml",
	md: "markdown",
	mdx: "markdown",
	py: "python",
	rs: "rust",
	go: "go",
	sql: "sql",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	yml: "yaml",
	yaml: "yaml",
};

/** The highlighter's language for a file, from its extension; null when it has none. */
export function languageFor(path: string): string | null {
	const extension = path.split("/").pop()?.split(".").slice(1).pop()?.toLowerCase();
	return (extension && EXTENSIONS[extension]) || null;
}

/** Code as highlighted HTML, one balanced line per source line; plain (escaped) without a language. */
export function highlightLines(text: string, language: string | null): string[] {
	const html =
		language && hljs.getLanguage(language)
			? hljs.highlight(text, { language, ignoreIllegals: true }).value
			: escapeHtml(text);
	return splitLines(html);
}

/** Copy a code card's text when its button is pressed; wire it to the element holding the HTML. */
export function copyCodeFrom(event: MouseEvent): void {
	const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-copy-code]");
	const code = button?.closest("figure")?.querySelector("code");
	if (!button || !code) return;
	void navigator.clipboard?.writeText(code.textContent ?? "").then(() => {
		button.textContent = "Copied";
		setTimeout(() => (button.textContent = "Copy"), 1500);
	});
}

export type MarkdownOptions = {
	/** When true, allows GitHub-supported inline HTML and images, sanitised against XSS. */
	allowHtml?: boolean;
};

export function renderMarkdown(text: string, options?: MarkdownOptions): string {
	if (options?.allowHtml) {
		const raw = documentMarkdown.parse(text, { async: false }) as string;
		return sanitizeHtml(raw);
	}
	return markdown.parse(text, { async: false }) as string;
}
