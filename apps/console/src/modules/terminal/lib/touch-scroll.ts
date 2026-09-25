import type { Terminal } from "@xterm/xterm";

import { type Arrow, arrowSequence, NO_MODIFIERS, sgrWheelSequence } from "./keys";

export type TouchScrollAction =
	| { kind: "scrollLines"; amount: number }
	| { kind: "send"; data: string };

/**
 * Calculates the scroll action for a touch vertical step.
 * - Normal buffer: scrolls terminal scrollback lines.
 * - Alternate buffer with mouse tracking: sends SGR wheel sequences (\x1b[<64;x;yM or 65) at the touch cell.
 * - Alternate buffer without mouse tracking: sends up/down arrow sequences.
 */
export function computeScrollAction(
	direction: "up" | "down",
	bufferType: "normal" | "alternate",
	mouseTrackingMode: string,
	applicationCursorMode: boolean,
	col: number,
	row: number,
): TouchScrollAction {
	if (bufferType === "normal") {
		return { kind: "scrollLines", amount: direction === "up" ? -1 : 1 };
	}
	if (mouseTrackingMode !== "none") {
		return { kind: "send", data: sgrWheelSequence(direction, col, row) };
	}
	const arrow: Arrow = direction === "up" ? "up" : "down";
	return { kind: "send", data: arrowSequence(arrow, applicationCursorMode, NO_MODIFIERS) };
}

export function getCellDimensions(
	terminal: Terminal,
	container: HTMLElement,
): { width: number; height: number } {
	const rect = container.getBoundingClientRect();
	const core = (
		terminal as unknown as {
			_core?: {
				_renderService?: {
					dimensions?: { css?: { cell?: { width?: number; height?: number } } };
				};
			};
		}
	)._core;
	const dims = core?._renderService?.dimensions?.css?.cell;
	const width = dims?.width && dims.width > 0 ? dims.width : rect.width / (terminal.cols || 80);
	const height =
		dims?.height && dims.height > 0 ? dims.height : rect.height / (terminal.rows || 24);
	return { width: Math.max(1, width), height: Math.max(1, height) };
}

export function getCellHeight(terminal: Terminal, container: HTMLElement): number {
	return getCellDimensions(terminal, container).height;
}

export function getCellCoords(
	terminal: Terminal,
	container: HTMLElement,
	clientX: number,
	clientY: number,
): { col: number; row: number } {
	const rect = container.getBoundingClientRect();
	const core = (
		terminal as unknown as {
			_core?: {
				_renderService?: {
					dimensions?: { css?: { cell?: { width?: number; height?: number } } };
				};
			};
		}
	)._core;
	const dims = core?._renderService?.dimensions?.css?.cell;
	const cellW = dims?.width && dims.width > 0 ? dims.width : rect.width / (terminal.cols || 80);
	const cellH = dims?.height && dims.height > 0 ? dims.height : rect.height / (terminal.rows || 24);
	const relX = Math.max(0, Math.min(rect.width - 1, clientX - rect.left));
	const relY = Math.max(0, Math.min(rect.height - 1, clientY - rect.top));
	const col = Math.min(terminal.cols || 80, Math.max(1, Math.floor(relX / cellW) + 1));
	const row = Math.min(terminal.rows || 24, Math.max(1, Math.floor(relY / cellH) + 1));
	return { col, row };
}

export type TouchScrollOptions = {
	terminal: Terminal;
	container: HTMLElement;
	send: (data: string) => void;
	onFontSizeChange?: (delta: number) => void;
};

/**
 * Attaches touch scrolling and pinch-to-zoom to the terminal host element.
 * Translates vertical swipes into line steps with momentum; lets horizontal swipes pass through.
 */
export function attachTouchScroll(options: TouchScrollOptions): () => void {
	const { terminal, container, send } = options;

	let startX = 0;
	let startY = 0;
	let lastY = 0;
	let lastX = 0;
	let accumulatedDeltaY = 0;
	let isDetermined = false;
	let isVertical = false;
	let momentumFrame = 0;
	let velocityY = 0;
	let lastTime = 0;
	let history: { y: number; time: number }[] = [];

	let pinchStartDistance: number | null = null;
	let lastPinchStep = 0;

	const stopMomentum = () => {
		if (momentumFrame) {
			cancelAnimationFrame(momentumFrame);
			momentumFrame = 0;
		}
	};

	const applyStep = (direction: "up" | "down", clientX: number, clientY: number) => {
		const { col, row } = getCellCoords(terminal, container, clientX, clientY);
		const action = computeScrollAction(
			direction,
			terminal.buffer.active.type,
			terminal.modes.mouseTrackingMode,
			terminal.modes.applicationCursorKeysMode,
			col,
			row,
		);
		if (action.kind === "scrollLines") {
			terminal.scrollLines(action.amount);
		} else {
			send(action.data);
		}
	};

	const onTouchStart = (event: TouchEvent) => {
		stopMomentum();

		if (event.touches.length === 2) {
			const t1 = event.touches[0];
			const t2 = event.touches[1];
			pinchStartDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
			lastPinchStep = 0;
			return;
		}

		if (event.touches.length !== 1) return;
		const touch = event.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		lastX = touch.clientX;
		lastY = touch.clientY;
		accumulatedDeltaY = 0;
		isDetermined = false;
		isVertical = false;
		velocityY = 0;
		lastTime = performance.now();
		history = [{ y: touch.clientY, time: lastTime }];
	};

	const onTouchMove = (event: TouchEvent) => {
		if (event.touches.length === 2 && pinchStartDistance !== null) {
			event.preventDefault();
			const t1 = event.touches[0];
			const t2 = event.touches[1];
			const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
			const delta = dist - pinchStartDistance;
			const step = Math.trunc(delta / 24);
			if (step !== lastPinchStep) {
				const diff = step - lastPinchStep;
				lastPinchStep = step;
				options.onFontSizeChange?.(diff);
			}
			return;
		}

		if (event.touches.length !== 1) return;
		const touch = event.touches[0];
		lastX = touch.clientX;

		if (!isDetermined) {
			const dx = touch.clientX - startX;
			const dy = touch.clientY - startY;
			if (Math.hypot(dx, dy) >= 6) {
				isDetermined = true;
				// Horizontal swipes pass through: don't preventDefault or intercept
				isVertical = Math.abs(dy) >= Math.abs(dx);
			}
		}

		if (!isVertical) return;

		// Prevent browser scrolling and handle terminal scroll
		event.preventDefault();

		const now = performance.now();
		const dy = touch.clientY - lastY;
		lastY = touch.clientY;

		history.push({ y: touch.clientY, time: now });
		const cutoff = now - 100;
		history = history.filter((sample) => sample.time >= cutoff);

		accumulatedDeltaY += dy;
		const cellHeight = getCellHeight(terminal, container);

		while (Math.abs(accumulatedDeltaY) >= cellHeight) {
			if (accumulatedDeltaY > 0) {
				// Finger pulled down -> scroll up
				applyStep("up", touch.clientX, touch.clientY);
				accumulatedDeltaY -= cellHeight;
			} else {
				// Finger pushed up -> scroll down
				applyStep("down", touch.clientX, touch.clientY);
				accumulatedDeltaY += cellHeight;
			}
		}
	};

	const onTouchEnd = (event: TouchEvent) => {
		if (event.touches.length < 2) {
			pinchStartDistance = null;
			lastPinchStep = 0;
		}

		if (!isVertical) return;

		// Calculate release velocity
		const now = performance.now();
		const cutoff = now - 100;
		const recent = history.filter((sample) => sample.time >= cutoff);
		if (recent.length >= 2) {
			const first = recent[0];
			const last = recent[recent.length - 1];
			const dt = last.time - first.time;
			if (dt > 0) {
				velocityY = (last.y - first.y) / dt; // px / ms
			}
		}

		// Decaying fling momentum
		if (Math.abs(velocityY) > 0.15) {
			let currentVel = velocityY;
			let prevTime = performance.now();
			const cellHeight = getCellHeight(terminal, container);

			const stepMomentum = (frameTime: number) => {
				const dt = Math.min(32, frameTime - prevTime);
				prevTime = frameTime;

				const displacement = currentVel * dt;
				accumulatedDeltaY += displacement;

				while (Math.abs(accumulatedDeltaY) >= cellHeight) {
					if (accumulatedDeltaY > 0) {
						applyStep("up", lastX, lastY);
						accumulatedDeltaY -= cellHeight;
					} else {
						applyStep("down", lastX, lastY);
						accumulatedDeltaY += cellHeight;
					}
				}

				// Friction decay
				currentVel *= Math.pow(0.92, dt / 16.67);

				if (Math.abs(currentVel) > 0.04) {
					momentumFrame = requestAnimationFrame(stepMomentum);
				} else {
					momentumFrame = 0;
				}
			};

			momentumFrame = requestAnimationFrame(stepMomentum);
		}
	};

	container.addEventListener("touchstart", onTouchStart, { passive: false });
	container.addEventListener("touchmove", onTouchMove, { passive: false });
	container.addEventListener("touchend", onTouchEnd);
	container.addEventListener("touchcancel", onTouchEnd);

	return () => {
		stopMomentum();
		container.removeEventListener("touchstart", onTouchStart);
		container.removeEventListener("touchmove", onTouchMove);
		container.removeEventListener("touchend", onTouchEnd);
		container.removeEventListener("touchcancel", onTouchEnd);
	};
}
