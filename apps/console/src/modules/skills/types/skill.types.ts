export type SkillFile = { path: string; content: string };

export type SkillScope = { type: "workspace" } | { type: "project"; project: string };

export type Skill = {
	id: string;
	workspace: string;
	name: string;
	description: string;
	enabled: boolean;
	scope: SkillScope;
	source: { type: "written" | "upload" | "git"; label: string; url?: string };
	skillMarkdown: string;
	files: SkillFile[];
	createdAt: string;
	updatedAt: string;
};

export type SkillProvider = {
	id: string;
	name: string;
	available: boolean;
	delivery: "message-context";
};

export type SkillsView = {
	skills: Skill[];
	projects: string[];
	providers: SkillProvider[];
	canManage: boolean;
};
