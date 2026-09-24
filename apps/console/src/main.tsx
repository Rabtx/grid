import { render } from "@solidjs/web";

import { Toaster } from "./ui";

import { App } from "./app";
import { installScaleShortcuts, restoreAppearance } from "./lib/appearance";
import { registerServiceWorker } from "./pwa/register";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the #root element");

restoreAppearance();
installScaleShortcuts();
registerServiceWorker();

render(
	() => (
		<>
			<App />
			<Toaster />
		</>
	),
	root,
);
