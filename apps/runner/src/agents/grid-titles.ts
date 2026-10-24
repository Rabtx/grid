/**
 * What a call to one of Grid's own tools reads as in the transcript, whichever agent made it:
 * "Added a board task: Fix login" rather than `mcp__grid__board_create_task`. Null for a tool that
 * is not Grid's, which the agent's adapter then names as it would any other.
 */
export function gridToolTitle(tool: string, input: Record<string, unknown> = {}): string | null {
	const name = tool.replace(/^mcp__grid__/, "").replace(/^grid[.:]/, "");
	if (name === tool && !tool.startsWith("grid")) return null;
	const title = typeof input.title === "string" ? input.title : null;
	switch (name) {
		case "show_visual":
			return title ? `Showed a visual: ${title}` : "Showed a visual";
		case "board_list_tasks":
			return "Read the board";
		case "board_create_task":
			return title ? `Added a board task: ${title}` : "Added a board task";
		case "board_update_task":
			return typeof input.number === "number"
				? `Updated task ${input.number}${typeof input.status === "string" ? ` → ${input.status}` : ""}`
				: "Updated a board task";
		case "crew_start_worker":
			return title ? `Started a crew member: ${title}` : "Started a crew member";
		case "crew_message_worker":
			return "Messaged a crew member";
		case "crew_list_workers":
			return "Checked the crew";
		case "crew_stop_worker":
			return "Stopped a crew member";
		case "browser_open": {
			const url = typeof input.url === "string" ? input.url.replace(/^https?:\/\//, "") : null;
			return url ? `Opened ${url.slice(0, 80)} in the browser` : "Opened a page in the browser";
		}
		case "browser_snapshot":
			return "Read the page";
		case "browser_click":
			return typeof input.ref === "number" ? `Clicked element ${input.ref}` : "Clicked on the page";
		case "browser_type":
			return typeof input.ref === "number"
				? `Typed into element ${input.ref}`
				: "Typed on the page";
		case "browser_press":
			return typeof input.key === "string" ? `Pressed ${input.key}` : "Pressed a key";
		case "browser_scroll":
			return "Scrolled the page";
		case "browser_back":
			return "Went back a page";
		case "browser_screenshot":
			return "Took a screenshot of the page";
		default:
			return null;
	}
}
