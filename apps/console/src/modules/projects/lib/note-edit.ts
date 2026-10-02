/**
 * The format bar's edits on a note's Markdown: each takes the text and the selection and gives
 * back the new text and what to select after, so the field stays where you were writing.
 */
export type Edit = { text: string; start: number; end: number };

/** Put marks around the selection (bold, italic, code), or around a placeholder when nothing is selected. */
export function wrap(edit: Edit, before: string, after: string, placeholder: string): Edit {
	const selected = edit.text.slice(edit.start, edit.end);
	// Already wrapped: take the marks off.
	if (
		selected &&
		edit.text.slice(edit.start - before.length, edit.start) === before &&
		edit.text.slice(edit.end, edit.end + after.length) === after
	) {
		return {
			text:
				edit.text.slice(0, edit.start - before.length) +
				selected +
				edit.text.slice(edit.end + after.length),
			start: edit.start - before.length,
			end: edit.end - before.length,
		};
	}
	const words = selected || placeholder;
	return {
		text: edit.text.slice(0, edit.start) + before + words + after + edit.text.slice(edit.end),
		start: edit.start + before.length,
		end: edit.start + before.length + words.length,
	};
}

// What a line may already start with: a heading, a task, a bullet or a number.
const LINE_MARK = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/;

/**
 * Give every selected line a start (a heading's `## `, a bullet, a task's box), or take it off
 * when they all have it already. An empty `mark` makes them plain text.
 */
export function markLines(edit: Edit, mark: string): Edit {
	const from = edit.start === 0 ? 0 : edit.text.lastIndexOf("\n", edit.start - 1) + 1;
	const next = edit.text.indexOf(
		"\n",
		Math.max(edit.end - (edit.end > edit.start ? 1 : 0), edit.start),
	);
	const to = next < 0 ? edit.text.length : next;
	const lines = edit.text.slice(from, to).split("\n");
	const marked = (line: string) => {
		const found = line.match(LINE_MARK);
		const current = found?.[2] ?? "";
		return mark !== "" && sameKind(current, mark);
	};
	const written = lines.filter((line) => line.trim());
	const off = mark !== "" && written.length > 0 && written.every(marked);
	const changed = lines.map((line) => {
		if (!line.trim() && lines.length > 1) return line;
		const found = line.match(LINE_MARK);
		const indent = found?.[1] ?? "";
		const rest = line.slice(found?.[0].length ?? 0);
		return off ? indent + rest : indent + mark + rest;
	});
	const block = changed.join("\n");
	const text = edit.text.slice(0, from) + block + edit.text.slice(to);
	// The caret keeps its place in the line's words; a selection covers the lines.
	if (edit.start === edit.end) {
		const shift = changed[0].length - lines[0].length;
		const at = Math.max(from, edit.start + shift);
		return { text, start: at, end: at };
	}
	return { text, start: from, end: from + block.length };
}

/** Whether a line's start is the same kind as the mark being added (a bullet for a bullet). */
function sameKind(current: string, mark: string): boolean {
	const kind = (value: string) =>
		value.startsWith("#")
			? value.trim()
			: /\[[ xX]\]/.test(value)
				? "task"
				: /^[-*+]/.test(value)
					? "bullet"
					: /^\d/.test(value)
						? "number"
						: "";
	return kind(current) !== "" && kind(current) === kind(mark);
}

/** Put text in place of the selection; the caret goes after it. */
export function insert(edit: Edit, words: string): Edit {
	const at = edit.start + words.length;
	return {
		text: edit.text.slice(0, edit.start) + words + edit.text.slice(edit.end),
		start: at,
		end: at,
	};
}

/** Code: backticks around words, or a fenced block around lines. */
export function code(edit: Edit): Edit {
	const selected = edit.text.slice(edit.start, edit.end);
	if (!selected.includes("\n")) return wrap(edit, "`", "`", "code");
	const before = edit.start > 0 && edit.text[edit.start - 1] !== "\n" ? "\n" : "";
	const fenced = `${before}\`\`\`\n${selected.replace(/\n$/, "")}\n\`\`\`\n`;
	return {
		text: edit.text.slice(0, edit.start) + fenced + edit.text.slice(edit.end),
		start: edit.start + before.length + 4,
		end: edit.start + before.length + 4 + selected.replace(/\n$/, "").length,
	};
}

/** A link: the selection becomes its words, and the address is selected to type over. */
export function link(edit: Edit): Edit {
	const words = edit.text.slice(edit.start, edit.end) || "link";
	const address = "https://";
	const written = `[${words}](${address})`;
	const at = edit.start + words.length + 3;
	return {
		text: edit.text.slice(0, edit.start) + written + edit.text.slice(edit.end),
		start: at,
		end: at + address.length,
	};
}

/** A file the note names, as Markdown: in backticks, which the note shows as a chip. */
export function mention(edit: Edit, path: string): Edit {
	const before = edit.start > 0 && !/\s/.test(edit.text[edit.start - 1]) ? " " : "";
	const after = edit.end < edit.text.length && /\s/.test(edit.text[edit.end]) ? "" : " ";
	return insert(edit, `${before}\`${path}\`${after}`);
}
