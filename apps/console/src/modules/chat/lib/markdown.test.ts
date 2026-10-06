import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";

const happyWindow = new Window({ url: "https://grid.test" });
vi.stubGlobal("window", happyWindow);
vi.stubGlobal("DOMParser", happyWindow.DOMParser);

const { renderMarkdown, splitLines } = await import("./markdown");

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

	it("highlights known languages and keeps unknown ones plain", () => {
		const ts = renderMarkdown("```ts\nconst answer = 42;\n```");
		expect(ts).toContain('class="hljs-keyword"');
		expect(ts).toContain('class="hljs-number"');
		const plain = renderMarkdown("```nonsense\n<b>x</b>\n```");
		expect(plain).not.toContain("hljs-");
		expect(plain).toContain("&lt;b&gt;");
	});

	it("keeps spans balanced on every line of a multi-line token", () => {
		const lines = splitLines('<span class="hljs-comment">/* one\ntwo */</span> x');
		expect(lines).toEqual([
			'<span class="hljs-comment">/* one</span>',
			'<span class="hljs-comment">two */</span> x',
		]);
	});

	it("renders task lists and tables", () => {
		const html = renderMarkdown("- [x] done\n- [ ] todo\n\n| a | b |\n| - | - |\n| 1 | 2 |");
		expect(html).toContain('type="checkbox"');
		expect(html).toContain("<table>");
	});

	it("keeps key caps and nothing else of raw HTML", () => {
		const html = renderMarkdown("Press <kbd>Ctrl</kbd>+<kbd>K</kbd> <span onclick=x>no</span>");
		expect(html).toContain("<kbd>Ctrl</kbd>");
		expect(html).not.toContain("<span onclick");
	});
});

describe("file chips", () => {
	it("marks backticked file paths as files, and leaves other code alone", () => {
		const html = renderMarkdown("Edit `src/theme/derive.ts:112`, run `bun test`, see `README.md`.");
		expect(html).toContain('<code class="file-chip">src/theme/derive.ts:112</code>');
		expect(html).toContain("<code>bun test</code>");
		expect(html).toContain('<code class="file-chip">README.md</code>');
	});

	it("escapes inline code", () => {
		expect(renderMarkdown("`<b>&x`")).toContain("<code>&lt;b&gt;&amp;x</code>");
	});
});

describe("renderMarkdown with allowHtml", () => {
	it("renders safe inline HTML allowed in pull request descriptions", () => {
		const text = `
<details open>
<summary>Click to view</summary>
<p>Inside details</p>
<img src="https://example.com/screenshot.png" alt="preview" width="300">
<br>
<table><thead><tr><th>Column</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>
Press <kbd>Enter</kbd> to submit, H<sub>2</sub>O and X<sup>2</sup>.
</details>
`;
		const html = renderMarkdown(text, { allowHtml: true });
		expect(html).toContain("<details");
		expect(html).toContain("<summary>Click to view</summary>");
		expect(html).toContain(
			'<img src="https://example.com/screenshot.png" alt="preview" width="300">',
		);
		expect(html).toContain("<br>");
		expect(html).toContain("<table>");
		expect(html).toContain("<th>Column</th>");
		expect(html).toContain("<td>Cell</td>");
		expect(html).toContain("<kbd>Enter</kbd>");
		expect(html).toContain("<sub>2</sub>");
		expect(html).toContain("<sup>2</sup>");
	});

	it("hides HTML comments", () => {
		const html = renderMarkdown("Visible <!-- hidden comment --> text", { allowHtml: true });
		expect(html).toContain("Visible");
		expect(html).toContain("text");
		expect(html).not.toContain("hidden comment");
		expect(html).not.toContain("<!--");
	});

	it("sanitizes dangerous HTML and prevents XSS", () => {
		const evil = `
<script>alert("xss")</script>
<img src="https://example.com/valid.png" onerror="alert(1)">
<img src="javascript:alert(2)">
<a href="javascript:alert(3)">malicious link</a>
<div style="background: red; position: fixed;">styled</div>
<style>body { display: none; }</style>
<iframe src="https://evil.com"></iframe>
`;
		const html = renderMarkdown(evil, { allowHtml: true });
		expect(html).not.toContain("<script");
		expect(html).not.toContain('alert("xss")');
		expect(html).not.toContain("onerror");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain('style="');
		expect(html).not.toContain("<style");
		expect(html).not.toContain("<iframe");
		expect(html).toContain('<img src="https://example.com/valid.png">');
		expect(html).toContain("<a>malicious link</a>");
		expect(html).toContain("<div>styled</div>");
	});

	it("renders markdown images with safe URLs", () => {
		const md = "![safe](https://example.com/image.png) and ![unsafe](javascript:alert(1))";
		const html = renderMarkdown(md, { allowHtml: true });
		expect(html).toContain('<img src="https://example.com/image.png" alt="safe">');
		expect(html).not.toContain('<img src="javascript');
	});
});
