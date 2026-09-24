/** Which way a sheet leaves the screen when it is swiped away. */
export type SwipeDirection = "down" | "left";

/** Movement before the gesture commits to an axis; below it a touch is still a tap or a scroll. */
export const SWIPE_SLOP_PX = 8;

/**
 * Whether a finished swipe dismisses the sheet: far enough (a third of its size) or fast enough
 * (a flick), and still heading out when the finger lifted.
 */
export function shouldDismiss(swipe: {
	/** Distance travelled in the dismiss direction, px (negative when pulled back). */
	distance: number;
	/** The sheet's size along that direction, px. */
	size: number;
	/** Speed in the dismiss direction over the last moments of the gesture, px/ms. */
	velocity: number;
}): boolean {
	if (swipe.distance <= 0) return false;
	if (swipe.velocity > 0.5 && swipe.distance > 24) return true;
	if (swipe.velocity < -0.1) return false;
	return swipe.distance > swipe.size / 3;
}

/**
 * How far the sheet follows the finger: one to one in the dismiss direction, and a short,
 * resisting stretch the other way so it never detaches from its edge.
 */
export function followFinger(distance: number): number {
	if (distance >= 0) return distance;
	return -Math.min(24, Math.sqrt(-distance) * 2);
}
