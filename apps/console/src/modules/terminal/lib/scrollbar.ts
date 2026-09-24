/** The smallest thumb a fingertip can still grab, px. */
export const MIN_THUMB_PX = 44;

export type ScrollState = {
	/** Height of the track the thumb moves in, px. */
	trackHeight: number;
	/** Visible rows. */
	rows: number;
	/** Top visible line (xterm `buffer.viewportY`). */
	viewportY: number;
	/** Furthest the view can scroll (xterm `buffer.baseY`); 0 means nothing to scroll. */
	baseY: number;
};

/** Where the thumb sits and how tall it is, or null when there is nothing to scroll. */
export function thumbGeometry(state: ScrollState): { top: number; height: number } | null {
	if (state.baseY <= 0 || state.trackHeight <= 0) return null;
	const total = state.baseY + state.rows;
	const height = Math.min(
		state.trackHeight,
		Math.max(MIN_THUMB_PX, (state.trackHeight * state.rows) / total),
	);
	const travel = state.trackHeight - height;
	const ratio = Math.min(1, Math.max(0, state.viewportY / state.baseY));
	return { top: travel * ratio, height };
}

/**
 * The line to show when the thumb's top is dragged to `thumbTop`, clamped to the scrollback,
 * so dragging past either end of the track pins to the first or last line.
 */
export function lineForThumb(thumbTop: number, state: ScrollState): number {
	const geometry = thumbGeometry(state);
	if (!geometry) return 0;
	const travel = state.trackHeight - geometry.height;
	if (travel <= 0) return 0;
	const ratio = Math.min(1, Math.max(0, thumbTop / travel));
	return Math.round(ratio * state.baseY);
}
