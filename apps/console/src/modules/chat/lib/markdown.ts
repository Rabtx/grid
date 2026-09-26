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

/**
 * Markdown for agent replies. Raw HTML in the text is shown as text, not rendered, and links
 * are limited to safe schemes, so nothing an agent prints can run in the page.
 */
const markdown = new Marked({
	gfm: true,
	breaks: false,
	renderer: {
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

export function renderMarkdown(text: string): string {
	return markdown.parse(text, { async: false }) as string;
}
