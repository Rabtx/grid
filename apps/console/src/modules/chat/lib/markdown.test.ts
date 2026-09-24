import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("window", { location: { origin: "https://grid.test" } });

const { renderMarkdown } = await import("./markdown");

describe("renderMarkdown", () => {
	it("renders the usual Markdown", () => {
		const html = renderMarkdown("**bold** and `code`\n\n- one\n- two");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<code>code</code>");
		expect(html).toContain("<li>one</li>");
	});

	it("shows raw HTML as text instead of running it", () => {
		const html = renderMarkdown('<img src=x onerror="alert(1)"> and <script>alert(1)</script>');
		expect(html).not.toContain("<img");
		expect(html).not.toContain("<script");
		expect(html).toContain("&lt;script&gt;");
	});

	it("keeps web links, opening them safely, and drops script links", () => {
		expect(renderMarkdown("[docs](https://example.com)")).toContain(
			'<a href="https://example.com/" target="_blank" rel="noopener noreferrer">docs</a>',
		);
		const evil = renderMarkdown("[click](javascript:alert(1))");
		expect(evil).not.toContain("href");
		expect(evil).toContain("click");
	});

	it("does not load remote images", () => {
		expect(renderMarkdown("![tracker](https://evil.test/pixel.png)")).not.toContain("<img");
	});

	it("draws fenced code as a card with its language, a copy button and one span per line", () => {
		const html = renderMarkdown("```ts\nconst a = 1;\nconst b = '<b>';\n```");
		expect(html).toContain('<figure class="code-block">');
		expect(html).toContain("<span>ts</span>");
		expect(html).toContain("data-copy-code");
		expect(html.match(/class="code-line"/g)).toHaveLength(2);
		expect(html).toContain("&lt;b&gt;");
	});
});
