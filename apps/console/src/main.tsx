import { render } from "@solidjs/web";

import { Toasts, TooltipLayer } from "./kit";

import { App } from "./app";
import { urlWithWorkspace } from "./lib/active-workspace";
import { installScaleShortcuts, restoreAppearance } from "./lib/appearance";
import { loadFileIcons } from "./lib/file-icons";
import { registerServiceWorker } from "./pwa/register";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the #root element");

restoreAppearance();
installScaleShortcuts();
void loadFileIcons();
registerServiceWorker();

// A page opened without its workspace (`/`, an old link) moves to its workspace URL first.
const moved = urlWithWorkspace();
if (moved) {
	window.location.replace(moved);
} else {
	render(
		() => (
			<>
				<App />
				<Toasts />
				<TooltipLayer />
			</>
		),
		root,
	);
}
