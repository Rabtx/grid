import { render } from "@solidjs/web";

import { App } from "./app";
import { installScaleShortcuts, restoreAppearance } from "./lib/appearance";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the #root element");

restoreAppearance();
installScaleShortcuts();

render(() => <App />, root);
