export type Density = "compact" | "comfortable" | "spacious";
export type Theme = "system" | "light" | "dark";

const DENSITY_KEY = "grid.density";
const THEME_KEY = "grid.theme";

function isDensity(value: unknown): value is Density {
	return value === "compact" || value === "comfortable" || value === "spacious";
}

function isTheme(value: unknown): value is Theme {
	return value === "system" || value === "light" || value === "dark";
}

export function applyDensity(value: Density): void {
	if (typeof document !== "undefined") {
		document.documentElement.setAttribute("data-density", value);
	}
	try {
		localStorage.setItem(DENSITY_KEY, value);
	} catch {
		// localStorage may throw when storage is blocked or quota is reached
	}
}

export function applyTheme(theme: Theme): void {
	if (typeof document !== "undefined") {
		const root = document.documentElement;
		if (theme === "dark") {
			root.classList.add("dark");
			root.classList.remove("light");
		} else if (theme === "light") {
			root.classList.add("light");
			root.classList.remove("dark");
		} else {
			root.classList.remove("dark", "light");
		}
	}
	try {
		localStorage.setItem(THEME_KEY, theme);
	} catch {
		// localStorage may throw when storage is blocked or quota is reached
	}
}

export function restorePreferences(): void {
	let savedDensity: Density = "comfortable";
	let savedTheme: Theme = "system";

	try {
		const density = localStorage.getItem(DENSITY_KEY);
		if (isDensity(density)) savedDensity = density;
	} catch {
		// Storage access can throw in private windows
	}

	try {
		const theme = localStorage.getItem(THEME_KEY);
		if (isTheme(theme)) savedTheme = theme;
	} catch {
		// Storage access can throw in private windows
	}

	applyDensity(savedDensity);
	applyTheme(savedTheme);
}
