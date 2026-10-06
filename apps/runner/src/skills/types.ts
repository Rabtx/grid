export type SkillFile = { path: string; content: string };

export type SkillSource =
	| { type: "written"; label: "Written in Grid" }
	| { type: "upload"; label: string }
	| { type: "git"; label: string; url: string };

export type SkillScope = { type: "workspace" } | { type: "project"; project: string };

export type Skill = {
	id: string;
	workspace: string;
	name: string;
	description: string;
	enabled: boolean;
	scope: SkillScope;
	source: SkillSource;
	skillMarkdown: string;
	files: SkillFile[];
	createdAt: string;
	updatedAt: string;
};

export type SkillInput = {
	skillMarkdown: string;
	files?: SkillFile[];
	source: SkillSource;
	scope: SkillScope;
};

export type SkillPatch = Partial<SkillInput> & { enabled?: boolean };

export type SkillProvider = {
	id: string;
	name: string;
	available: boolean;
	delivery: "message-context";
};
