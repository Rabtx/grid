import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectFileContent } from "../services/files.service";
import { filesService } from "../services/files.service";
import { FileEditor } from "./file-editor";
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/kit", async (original) => ({
	...(await original<Record<string, unknown>>()),
	CodeEditor: (props: { value: string; onChange: (value: string) => void }) => (
		<textarea
			aria-label="Draft"
			value={props.value}
			onInput={(event) => props.onChange(event.currentTarget.value)}
		/>
	),
}));
const placement = vi.hoisted(() => ({ value: "" }));
vi.mock("@/modules/environments", () => ({
	placementsStore: { scopeOf: () => placement.value, environmentOf: () => placement.value },
}));
beforeEach(() => {
	placement.value = "";
});
const file = (path = "readme.md", text = "original", hash = "first"): ProjectFileContent => ({
	path,
	name: path,
	text,
	hash,
	size: text.length,
	binary: false,
	tooLarge: false,
});
let dispose: (() => void) | undefined;
afterEach(() => {
	dispose?.();
	dispose = undefined;
	document.body.innerHTML = "";
	vi.restoreAllMocks();
});
function mount() {
	const container = document.createElement("div");
	document.body.append(container);
	const [shown, setShown] = createSignal(file());
	const saved = vi.fn(),
		dirty = vi.fn();
	dispose = render(
		() => (
			<FileEditor slug="alpha" file={shown()} onDirty={dirty} onSaved={saved} onClose={() => {}} />
		),
		container,
	);
	flush();
	return { container, setShown, saved, dirty };
}
function edit(container: HTMLElement, text: string) {
	const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
	textarea.value = text;
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
	flush();
}
function save(container: HTMLElement) {
	[...container.querySelectorAll("button")]
		.find((button) => button.textContent?.trim() === "Save")!
		.click();
	flush();
}
async function settle() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
	flush();
}
describe("in-flight file saves", () => {
	it("keeps edits typed while a save is in flight and saves them against the new base", async () => {
		let finish!: (value: ProjectFileContent) => void;
		const write = vi
			.spyOn(filesService, "save")
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			)
			.mockResolvedValue(file("readme.md", "second edit", "third"));
		const { container, dirty } = mount();
		edit(container, "first edit");
		save(container);
		edit(container, "second edit");
		finish(file("readme.md", "first edit", "second"));
		await settle();
		expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("second edit");
		expect(dirty).toHaveBeenLastCalledWith(true);
		save(container);
		await settle();
		expect(write).toHaveBeenLastCalledWith("token", "alpha", "readme.md", "second edit", "second");
	});
	it("does not replace the next file when an old save finishes", async () => {
		let finish!: (value: ProjectFileContent) => void;
		vi.spyOn(filesService, "save").mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const { container, setShown, saved } = mount();
		edit(container, "first edit");
		save(container);
		setShown(file("next.md", "next file", "next"));
		flush();
		finish(file("readme.md", "first edit", "second"));
		await settle();
		expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("next file");
		expect(saved).not.toHaveBeenCalled();
	});
	it("ignores an old machine's save after the project's placement changes", async () => {
		let finish!: (value: ProjectFileContent) => void;
		vi.spyOn(filesService, "save").mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const { container, saved } = mount();
		edit(container, "edit");
		save(container);
		placement.value = "/env/another";
		finish(file("readme.md", "edit", "second"));
		await settle();
		expect(saved).not.toHaveBeenCalled();
	});
});
