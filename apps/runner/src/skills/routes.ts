import type { Who } from "../auth";
import { may, NOT_ALLOWED } from "../permissions";
import type { ChatHub } from "../chat/hub";
import { importGitRepository, importZip } from "./imports";
import type { SkillStore } from "./store";
import type { SkillPatch } from "./types";
import {
	SkillError,
	normalizeSkillPath,
	validateSkillInput,
	validateSkillScope,
} from "./validation";

const MAX_JSON_BYTES = 100 * 1024;
const MAX_UPLOAD_BODY_BYTES = 9 * 1024 * 1024;

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}

async function bytes(request: Request, limit: number): Promise<Uint8Array> {
	const statedLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(statedLength) && statedLength > limit)
		throw new SkillError("The request is larger than the upload limit", 413);
	if (!request.body) return new Uint8Array();
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > limit) throw new SkillError("The request is larger than the upload limit", 413);
			chunks.push(value);
		}
	} catch (cause) {
		await reader.cancel().catch(() => undefined);
		throw cause;
	} finally {
		reader.releaseLock();
	}
	const result = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
	const raw = await bytes(request, MAX_JSON_BYTES);
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
	} catch {
		throw new SkillError("Send skill details as JSON");
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new SkillError("Send skill details as a JSON object");
	return value as Record<string, unknown>;
}

type UploadedForm = {
	get: (name: string) => File | string | null;
	getAll: (name: string) => (File | string)[];
};

async function formBody(request: Request): Promise<UploadedForm> {
	const raw = await bytes(request, MAX_UPLOAD_BODY_BYTES);
	const copy = new Request(request.url, { method: "POST", headers: request.headers, body: raw });
	try {
		return (await copy.formData()) as unknown as UploadedForm;
	} catch {
		throw new SkillError("Choose a skill folder or ZIP file");
	}
}

function textField(form: UploadedForm, name: string): string | undefined {
	const value = form.get(name);
	return typeof value === "string" ? value : undefined;
}

function scopeField(raw: string | undefined, projects: readonly string[]) {
	if (!raw) throw new SkillError("Choose workspace or project scope");
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new SkillError("Choose workspace or project scope");
	}
	return validateSkillScope(value, projects);
}

async function uploadInput(form: UploadedForm, projects: readonly string[]) {
	const scope = scopeField(textField(form, "scope"), projects);
	const archive = form.get("archive");
	if (archive instanceof File) {
		const imported = await importZip(
			new Uint8Array(await archive.arrayBuffer()),
			textField(form, "path"),
		);
		return {
			...validateSkillInput(
				{
					...imported,
					source: { type: "upload", label: archive.name || "Uploaded ZIP" },
					scope,
				},
				projects,
			),
		};
	}
	const files = form.getAll("files").filter((file): file is File => file instanceof File);
	if (files.length === 0) throw new SkillError("Choose a skill folder or ZIP file");
	let paths: unknown;
	try {
		paths = JSON.parse(textField(form, "paths") ?? "[]");
	} catch {
		throw new SkillError("The uploaded file names could not be read");
	}
	if (
		!Array.isArray(paths) ||
		paths.length !== files.length ||
		paths.some((path) => typeof path !== "string")
	)
		throw new SkillError("The uploaded file names could not be read");
	const textFiles = await Promise.all(
		files.map(async (file, index) => ({
			path: normalizeSkillPath(paths[index] as string),
			content: new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()),
		})),
	);
	const skillEntries = textFiles.filter(
		(file) => file.path === "SKILL.md" || file.path.endsWith("/SKILL.md"),
	);
	if (skillEntries.length !== 1)
		throw new SkillError(
			skillEntries.length === 0
				? "The uploaded folder has no SKILL.md"
				: "Choose a folder containing one SKILL.md",
		);
	const markdownEntry = skillEntries[0];
	if (!markdownEntry) throw new SkillError("The uploaded folder has no SKILL.md");
	const prefix =
		markdownEntry.path === "SKILL.md" ? "" : markdownEntry.path.slice(0, -"/SKILL.md".length);
	const markdown = markdownEntry.content;
	const extra = textFiles
		.filter((file) => file !== markdownEntry)
		.filter((file) => (prefix ? file.path.startsWith(`${prefix}/`) : true))
		.map((file) => ({
			path: prefix ? file.path.slice(prefix.length + 1) : file.path,
			content: file.content,
		}));
	return validateSkillInput(
		{
			skillMarkdown: markdown,
			files: extra,
			source: { type: "upload", label: "Uploaded folder" },
			scope,
		},
		projects,
	);
}

/** Settings → Agents → Skills: workspace-scoped CRUD and inert Git/upload imports. */
export async function skillRequest(
	request: Request,
	url: URL,
	who: Who,
	store: SkillStore,
	chat: ChatHub,
): Promise<Response | null> {
	if (!(url.pathname === "/skills" || url.pathname.startsWith("/skills/"))) return null;
	const { workspace } = who;
	const projects = Object.keys(chat.projectFolders(workspace));
	if (request.method !== "GET" && !may(who, "integrations")) return failure(403, NOT_ALLOWED);
	try {
		if (url.pathname === "/skills" && request.method === "GET")
			return Response.json({
				data: {
					skills: await store.list(workspace),
					projects,
					providers: chat.skillProviders(),
					canManage: may(who, "integrations"),
				},
			});

		if (url.pathname === "/skills" && request.method === "POST") {
			const body = await jsonBody(request);
			const input = validateSkillInput(body, projects);
			return Response.json({ data: await store.add(workspace, input) }, { status: 201 });
		}

		if (url.pathname === "/skills/import/git" && request.method === "POST") {
			const body = await jsonBody(request);
			if (typeof body.url !== "string")
				throw new SkillError("Enter a public GitHub repository URL");
			const imported = await importGitRepository(
				body.url,
				typeof body.path === "string" ? body.path : undefined,
			);
			const input = validateSkillInput(
				{
					...imported,
					source: { type: "git", url: body.url },
					scope: body.scope,
				},
				projects,
			);
			return Response.json({ data: await store.add(workspace, input) }, { status: 201 });
		}

		if (url.pathname === "/skills/import/upload" && request.method === "POST") {
			const form = await formBody(request);
			const input = await uploadInput(form, projects);
			return Response.json({ data: await store.add(workspace, input) }, { status: 201 });
		}

		const match = url.pathname.match(/^\/skills\/([\w-]+)$/);
		if (match && request.method === "PATCH") {
			const body = await jsonBody(request);
			const patch: SkillPatch = {
				...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
				...(typeof body.skillMarkdown === "string" ? { skillMarkdown: body.skillMarkdown } : {}),
				...(Array.isArray(body.files) ? { files: body.files as SkillPatch["files"] } : {}),
				...(body.scope !== undefined ? { scope: body.scope as SkillPatch["scope"] } : {}),
			};
			if (Object.keys(patch).length === 0) throw new SkillError("Say what to change");
			return Response.json({
				data: await store.update(workspace, match[1] ?? "", patch, projects),
			});
		}
		if (match && request.method === "DELETE") {
			await store.remove(workspace, match[1] ?? "");
			return new Response(null, { status: 204 });
		}
		return failure(404, "Not found");
	} catch (cause) {
		if (cause instanceof SkillError) return failure(cause.status, cause.message);
		if (cause instanceof TypeError && request.method === "POST")
			return failure(400, "One of the uploaded files is not UTF-8 text");
		console.error("[runner] skill request failed", cause instanceof Error ? cause.message : cause);
		return failure(500, "The skill could not be saved");
	}
}
