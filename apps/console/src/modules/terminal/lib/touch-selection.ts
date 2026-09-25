import type { Terminal } from "@xterm/xterm";

import { getCellDimensions } from "./touch-scroll";

/**
 * Finds the start and length of a word around the specified column in a line.
 * Groups alphanumeric characters, paths, and URLs together.
 */
export function findWordBounds(lineText: string, col: number): { start: number; length: number } {
	if (!lineText || col < 0) return { start: Math.max(0, col), length: 1 };
	const len = lineText.length;
	const c = col >= len ? "" : lineText[col];
	const isWordChar = (ch: string) => /[a-zA-Z0-9_.:~/?=&%#+@-]/.test(ch);

	if (c && isWordChar(c)) {
		let start = col;
		let end = col;
		while (start > 0 && isWordChar(lineText[start - 1])) start--;
		while (end < len && isWordChar(lineText[end])) end++;
		return { start, length: Math.max(1, end - start) };
	}
	if (c && /\S/.test(c)) {
		let start = col;
		let end = col;
		while (start > 0 && /\S/.test(lineText[start - 1])) start--;
		while (end < len && /\S/.test(lineText[end])) end++;
		return { start, length: Math.max(1, end - start) };
	}
	return { start: Math.min(len, col), length: 1 };
}

/**
 * Normalizes start and end coordinates into a valid xterm select(col, row, length) call.
 */
export function computeSelectionRange(
	startCol: number,
	startRow: number,
	endCol: number,
	endRow: number,
	cols: number,
): { col: number; row: number; length: number } {
	let sCol = startCol;
	let sRow = startRow;
	let eCol = endCol;
	let eRow = endRow;

	if (sRow > eRow || (sRow === eRow && sCol > eCol)) {
		const tempCol = sCol;
		const tempRow = sRow;
		sCol = eCol;
		sRow = eRow;
		eCol = tempCol;
		eRow = tempRow;
	}

	const length = (eRow - sRow) * cols + (eCol - sCol);
	return { col: sCol, row: sRow, length: Math.max(1, length) };
}

export type SelectionPosition = {
	startHandle: { x: number; y: number; visible: boolean };
	endHandle: { x: number; y: number; visible: boolean };
	actionBar: { x: number; y: number; visible: boolean };
};

export function getSelectionGeometry(
	terminal: Terminal,
	container: HTMLElement,
): SelectionPosition | null {
	if (!terminal.hasSelection()) return null;
	const range = terminal.getSelectionPosition();
	if (!range) return null;

	const dims = getCellDimensions(terminal, container);
	const viewportY = terminal.buffer.active.viewportY;
	const startVisibleRow = range.start.y - viewportY;
	const endVisibleRow = range.end.y - viewportY;

	const startX = range.start.x * dims.width;
	const startY = startVisibleRow * dims.height;

	const endX = range.end.x * dims.width;
	const endY = (endVisibleRow + 1) * dims.height;

	const rows = terminal.rows || 24;
	const startInViewport = startVisibleRow >= -1 && startVisibleRow <= rows;
	const endInViewport = endVisibleRow >= 0 && endVisibleRow <= rows + 1;

	// Floating action bar placed above the top of the selection or clamped in view
	const barX = Math.max(10, Math.min(container.clientWidth - 180, startX));
	const barY = Math.max(8, startY - 42);

	return {
		startHandle: { x: startX, y: startY, visible: startInViewport },
		endHandle: { x: endX, y: endY, visible: endInViewport },
		actionBar: { x: barX, y: barY, visible: startInViewport || endInViewport },
	};
}
