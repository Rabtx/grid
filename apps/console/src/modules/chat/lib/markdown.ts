import { Marked, type Tokens } from "marked";

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
			return escapeHtml(token.text);
		},
		link(token: Tokens.Link) {
			const href = safeHref(token.href);
			const text = this.parser.parseInline(token.tokens);
			if (!href) return text;
			return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
		},
		code(token: Tokens.Code) {
			// A card: the language and a copy button over numbered lines. The copy button works through
			// a delegated click handler in the transcript, since this is rendered as HTML.
			const language = (token.lang ?? "").split(/\s/)[0];
			const lines = token.text.replace(/\n$/, "").split("\n");
			const body = lines
				.map((line) => `<span class="code-line">${escapeHtml(line)}</span>`)
				.join("\n");
			return `<figure class="code-block"><figcaption><span>${escapeHtml(language || "text")}</span><button type="button" data-copy-code aria-label="Copy code">Copy</button></figcaption><pre><code>${body}</code></pre></figure>`;
		},
		image(token: Tokens.Image) {
			// No remote images: they would load third-party content into the console.
			return escapeHtml(token.text || token.href);
		},
	},
});

export function renderMarkdown(text: string): string {
	return markdown.parse(text, { async: false }) as string;
}
