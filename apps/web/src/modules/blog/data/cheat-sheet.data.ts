/**
 * The app UI cheat sheet from "UI/UX design in the AI era". Each row is a spec and the live
 * specimen next to it is drawn from these same numbers, so the sheet cannot drift from its
 * own examples.
 */

export const CHEAT_SHEET = {
	type: {
		family: "Inter",
		title: { sizes: [16, 20], weight: "Medium" },
		label: { sizes: [13, 16], weight: "Medium" },
		body: { size: 14, weight: "Regular" },
	},
	button: { height: 32, radius: 10 },
	rows: { data: 40, stores: 44 },
	badge: { height: 20, radius: 6, fill: "#CAFACE", text: "#15B042" },
	switch: { width: 24, height: 14, thumb: 10, track: "#0077E6" },
	text: { default: "#333333", subtle: "#777777" },
} as const;

export type CheatSheetRow = {
	id: "type" | "buttons" | "rows" | "badge" | "switch" | "text";
	label: string;
	spec: string;
};

const { type, button, rows, badge, switch: toggle, text } = CHEAT_SHEET;

export const CHEAT_SHEET_ROWS: readonly CheatSheetRow[] = [
	{
		id: "type",
		label: "Type",
		spec: `${type.family}, ${type.title.sizes.join("/")}px ${type.title.weight} titles, ${type.label.sizes.join("/")}px ${type.label.weight} labels, ${type.body.size}px ${type.body.weight} body`,
	},
	{
		id: "buttons",
		label: "Buttons",
		spec: `${button.height}px height, ${button.radius}px radius`,
	},
	{
		id: "rows",
		label: "Rows",
		spec: `${rows.data}px data, ${rows.stores}px stores`,
	},
	{
		id: "badge",
		label: "Badge",
		spec: `${badge.height}px height, ${badge.radius}px radius, ${badge.fill} fill, ${badge.text} text`,
	},
	{
		id: "switch",
		label: "Switch",
		spec: `${toggle.width}×${toggle.height}px, ${toggle.thumb}px thumb, ${toggle.track} track`,
	},
	{
		id: "text",
		label: "Text",
		spec: `${text.default} default, ${text.subtle} subtle`,
	},
];
