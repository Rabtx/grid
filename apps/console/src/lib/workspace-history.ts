import { browserHistory, type RouterHistory } from "@solidjs/router";

import { routerBase } from "./active-workspace";

/** `/acme/chat/web` → `/chat/web`: the path the routes match, without the workspace. */
export function withoutBase(path: string, base: string): string {
	if (!base) return path;
	if (path === base) return "/";
	if (path.startsWith(`${base}/`)) return path.slice(base.length);
	if (path.startsWith(`${base}?`) || path.startsWith(`${base}#`))
		return `/${path.slice(base.length)}`;
	return path;
}

/**
 * Browser history with the workspace kept out of the router's sight: the address bar reads
 * `/acme/chat/web` while routes, links and `useLocation` all deal in `/chat/web`. Links written
 * either way land in the same place, and a navigation always writes the workspace back.
 */
export function workspaceHistory(base: string = routerBase()): RouterHistory {
	const browser = browserHistory();
	if (!base) return browser;
	return {
		...browser,
		get: () => {
			const source = browser.get();
			return typeof source === "string"
				? withoutBase(source, base)
				: { ...source, value: withoutBase(source.value, base) };
		},
		set: (next) => browser.set({ ...next, value: `${base}${next.value}` }),
		utils: {
			...browser.utils,
			parsePath: (path) => withoutBase(path, base),
			renderPath: (path) => `${base}${path}`,
		},
	};
}
