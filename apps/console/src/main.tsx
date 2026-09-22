import { render } from "@solidjs/web";

import { App } from "./app";
import { restorePreferences } from "./lib/preferences";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the #root element");

restorePreferences();

render(() => <App />, root);
