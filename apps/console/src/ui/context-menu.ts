/** Where a context menu was asked for: the pointer or the finger. */
export type MenuPoint = { x: number; y: number };

/** How long a finger rests before it counts as a long press, as on phones' own lists. */
export const LONG_PRESS_MS = 450;
/** Movement that turns a press into a scroll or a swipe instead. */
const MOVE_SLOP_PX = 10;

/**
 * Open a row's menu the way each device expects: right-click (or the keyboard's menu key) on a
 * desktop, and a long press on touch screens — with a short vibration where the device has one.
 * The click that ends a long press is swallowed, so the row does not also open. Returns a
 * cleanup.
 */
export function attachContextMenu(
	element: HTMLElement,
	open: (point: MenuPoint) => void,
): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let start: MenuPoint | null = null;
	let fired = false;

	const cancel = () => {
		clearTimeout(timer);
		timer = undefined;
		start = null;
	};

	// The menu is a light-dismiss popover: opened while the finger or button is still down, the
	// release would count as a click outside and close it at once. So it opens on release.
	let pressed = false;
	const onPointerDown = () => {
		pressed = true;
	};
	const fire = (point: MenuPoint) => {
		fired = true;
		navigator.vibrate?.(8);
		const show = () => setTimeout(() => open(point), 0);
		if (!pressed) return show();
		window.addEventListener(
			"pointerup",
			() => {
				pressed = false;
				show();
			},
			{ once: true },
		);
	};
	const onPointerUp = () => {
		pressed = false;
	};

	const onTouchStart = (event: TouchEvent) => {
		fired = false;
		if (event.touches.length !== 1) return cancel();
		const touch = event.touches[0];
		start = { x: touch.clientX, y: touch.clientY };
		timer = setTimeout(() => {
			if (start) fire(start);
			cancel();
		}, LONG_PRESS_MS);
	};

	const onTouchMove = (event: TouchEvent) => {
		if (!start) return;
		const touch = event.touches[0];
		if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > MOVE_SLOP_PX) cancel();
	};

	// Android also reports a long press as `contextmenu`; the timer may already have fired.
	const onContextMenu = (event: MouseEvent) => {
		event.preventDefault();
		if (fired) return;
		cancel();
		const box = element.getBoundingClientRect();
		// The keyboard's menu key reports (0, 0): open at the row instead.
		const fromKeyboard = event.clientX === 0 && event.clientY === 0;
		fire(
			fromKeyboard ? { x: box.left + 16, y: box.bottom } : { x: event.clientX, y: event.clientY },
		);
		// A right-click's own "click" never comes, so the next real click must go through.
		if ((event as PointerEvent).pointerType !== "touch") fired = false;
	};

	const onClick = (event: MouseEvent) => {
		if (!fired) return;
		fired = false;
		event.preventDefault();
		event.stopPropagation();
	};

	element.addEventListener("pointerdown", onPointerDown);
	window.addEventListener("pointerup", onPointerUp);
	element.addEventListener("touchstart", onTouchStart, { passive: true });
	element.addEventListener("touchmove", onTouchMove, { passive: true });
	element.addEventListener("touchend", cancel);
	element.addEventListener("touchcancel", cancel);
	element.addEventListener("contextmenu", onContextMenu);
	element.addEventListener("click", onClick, { capture: true });
	return () => {
		cancel();
		element.removeEventListener("pointerdown", onPointerDown);
		window.removeEventListener("pointerup", onPointerUp);
		element.removeEventListener("touchstart", onTouchStart);
		element.removeEventListener("touchmove", onTouchMove);
		element.removeEventListener("touchend", cancel);
		element.removeEventListener("touchcancel", cancel);
		element.removeEventListener("contextmenu", onContextMenu);
		element.removeEventListener("click", onClick, { capture: true });
	};
}
