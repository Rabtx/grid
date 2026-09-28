/**
 * A sideways scroller shows that there is more past its edge: the `edge-fade` utility fades out
 * whichever end still has content beyond it, and this keeps its `data-fade` in step as it scrolls
 * or resizes (`start`, `end`, `both`, or nothing when everything fits). Returns the cleanup.
 */
export function attachEdgeFade(el: HTMLElement): () => void {
	const update = () => {
		const before = el.scrollLeft > 1;
		const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
		const fade = before && after ? "both" : before ? "start" : after ? "end" : "";
		if (fade) el.dataset.fade = fade;
		else delete el.dataset.fade;
	};
	update();
	el.addEventListener("scroll", update, { passive: true });
	const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
	resize?.observe(el);
	// Content that arrives later (chips, tabs) changes the width without a resize of the box.
	const mutate = typeof MutationObserver === "undefined" ? null : new MutationObserver(update);
	mutate?.observe(el, { childList: true, subtree: true });
	return () => {
		el.removeEventListener("scroll", update);
		resize?.disconnect();
		mutate?.disconnect();
	};
}
