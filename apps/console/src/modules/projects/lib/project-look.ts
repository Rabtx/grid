/**
 * How a project is drawn in the sidebar and elsewhere: a colour and an icon. Both are optional
 * on the project; without them a colour is picked from its name (stable, so it never jumps) and
 * the icon is a folder.
 */

/** Saturated enough to read on the dark and light canvases alike. */
export const PROJECT_COLORS = [
	{ id: "slate", value: "hsl(215 12% 60%)" },
	{ id: "blue", value: "hsl(212 90% 62%)" },
	{ id: "violet", value: "hsl(262 70% 68%)" },
	{ id: "pink", value: "hsl(330 72% 64%)" },
	{ id: "red", value: "hsl(4 78% 60%)" },
	{ id: "orange", value: "hsl(24 88% 58%)" },
	{ id: "amber", value: "hsl(42 92% 55%)" },
	{ id: "green", value: "hsl(145 52% 48%)" },
	{ id: "teal", value: "hsl(174 58% 44%)" },
	{ id: "cyan", value: "hsl(192 80% 52%)" },
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

/** The colour a project is drawn in: its own, else one picked from its slug. */
export function projectColor(project: { slug: string; color?: string | null }): string {
	const chosen = project.color;
	if (chosen && HEX.test(chosen)) return chosen;
	const named = PROJECT_COLORS.find((color) => color.id === chosen);
	if (named) return named.value;
	let hash = 0;
	for (const char of project.slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	// Skip slate, which reads as "no colour", for the automatic pick.
	return PROJECT_COLORS[(hash % (PROJECT_COLORS.length - 1)) + 1].value;
}

/** Symbols a project can wear, by id (the icon files live with the component that draws them). */
export const PROJECT_SYMBOLS = [
	"rocket",
	"code",
	"terminal",
	"globe",
	"browser",
	"phone",
	"database",
	"cloud",
	"cpu",
	"layers",
	"package",
	"puzzle",
	"robot",
	"atom",
	"flash",
	"fire",
	"leaf",
	"sun",
	"moon",
	"star",
	"heart",
	"diamond",
	"target",
	"flag",
	"idea",
	"shield",
	"chart",
	"briefcase",
	"bag",
	"game",
	"music",
	"camera",
	"book",
	"paint",
	"mail",
	"coffee",
	"home",
] as const;

export type ProjectSymbol = (typeof PROJECT_SYMBOLS)[number];

/**
 * 8×8 pixel mascots. `#` takes the project colour, `.` stays clear. Each has a resting frame and
 * a busy one; while a thread in the project is running the two alternate.
 */
export const PROJECT_MASCOTS: Record<string, { rest: string[]; busy: string[] }> = {
	robot: {
		rest: [
			"...##...",
			"...##...",
			".######.",
			"#.#..#.#",
			"########",
			".#....#.",
			".######.",
			".#....#.",
		],
		busy: [
			"..#..#..",
			"...##...",
			".######.",
			"##.##.##",
			"########",
			".#.##.#.",
			".######.",
			"#......#",
		],
	},
	cat: {
		rest: [
			"#......#",
			"##....##",
			"########",
			"#.#..#.#",
			"########",
			"##.##.##",
			".######.",
			".#....#.",
		],
		busy: [
			"#......#",
			"##....##",
			"########",
			"########",
			"########",
			"##.##.##",
			".######.",
			"#......#",
		],
	},
	rocket: {
		rest: [
			"...##...",
			"..####..",
			"..#..#..",
			"..####..",
			"..####..",
			".######.",
			"#.#..#.#",
			"...##...",
		],
		busy: [
			"...##...",
			"..####..",
			"..#..#..",
			"..####..",
			"..####..",
			".######.",
			"#.####.#",
			"..#..#..",
		],
	},
	sprout: {
		rest: [
			"........",
			".##..##.",
			"###..###",
			".##..##.",
			"...##...",
			"...##...",
			".######.",
			"..####..",
		],
		busy: [
			".##.....",
			"###..##.",
			".##.###.",
			"....##..",
			"...##...",
			"...##...",
			".######.",
			"..####..",
		],
	},
	blob: {
		rest: [
			"........",
			"..####..",
			".######.",
			"##.##.##",
			"########",
			"########",
			"########",
			"#.#..#.#",
		],
		busy: [
			"........",
			"........",
			"..####..",
			".##.##.#",
			"########",
			"########",
			"########",
			"########",
		],
	},
	ghost: {
		rest: [
			"..####..",
			".######.",
			"##.##.##",
			"##.##.##",
			"########",
			"########",
			"########",
			"#.##.##.",
		],
		busy: [
			"..####..",
			".######.",
			"#.##.###",
			"#.##.###",
			"########",
			"########",
			"########",
			".##.##.#",
		],
	},
};

/** A frame as SVG path data over an 8×8 view box: one square per filled pixel. */
export function mascotPath(rows: string[]): string {
	let path = "";
	rows.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) if (row[x] === "#") path += `M${x} ${y}h1v1h-1z`;
	});
	return path;
}

export type ProjectIconChoice =
	| { kind: "folder" }
	| { kind: "letter" }
	| { kind: "symbol"; id: ProjectSymbol }
	| { kind: "mascot"; id: string };

/** A stored icon id read back; anything unknown falls back to the folder. */
export function parseProjectIcon(icon: string | null | undefined): ProjectIconChoice {
	if (icon === "letter") return { kind: "letter" };
	const [kind, id] = (icon ?? "").split(":");
	if (kind === "symbol" && (PROJECT_SYMBOLS as readonly string[]).includes(id))
		return { kind: "symbol", id: id as ProjectSymbol };
	if (kind === "mascot" && id && id in PROJECT_MASCOTS) return { kind: "mascot", id };
	return { kind: "folder" };
}
