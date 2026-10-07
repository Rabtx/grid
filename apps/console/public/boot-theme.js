// The saved theme and depth, applied before the first paint so the page does not flash. A file,
// not an inline script, so the Content-Security-Policy can refuse every inline script.
try {
	const saved = JSON.parse(localStorage.getItem("grid.appearance") || "{}");
	const theme = saved.theme ?? localStorage.getItem("grid.theme");
	// Depth before the first paint, so the page does not flash flat and then lift. It is off
	// by default; only a choice saved under the current design generation (3) turns it on.
	if (saved.depth === true && saved.design === 3)
		document.documentElement.setAttribute("data-depth", "on");
	if (theme === "light" || theme === "dark") {
		document.documentElement.classList.add(theme);
		document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
			meta.content = theme === "dark" ? "#141414" : "#ffffff";
		});
	}
} catch {
	// Use the system theme if storage is unavailable or invalid.
}
