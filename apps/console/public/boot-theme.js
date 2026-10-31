// The saved theme, depth and corners, applied before the first paint so the page does not
// flash. A file, not an inline script, so the Content-Security-Policy can refuse every inline
// script.
try {
	const saved = JSON.parse(localStorage.getItem("grid.appearance") || "{}");
	const theme = saved.theme ?? localStorage.getItem("grid.theme");
	// Depth before the first paint, so the page does not flash flat and then lift. It is off
	// by default; only a choice saved since design generation 3 turns it on.
	if (saved.depth === true && typeof saved.design === "number" && saved.design >= 3)
		document.documentElement.setAttribute("data-depth", "on");
	// Corners too, so a square or soft interface does not paint with pills first.
	if (saved.corners === "soft" || saved.corners === "square")
		document.documentElement.setAttribute("data-corners", saved.corners);
	if (theme === "light" || theme === "dark") {
		document.documentElement.classList.add(theme);
		document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
			meta.content = theme === "dark" ? "#141414" : "#ffffff";
		});
	}
} catch {
	// Use the system theme if storage is unavailable or invalid.
}
