import { flush } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localStore } from "@/lib/local-store";
import { placementsStore } from "@/modules/environments/stores/placements";
import { environmentsStore } from "@/modules/environments/stores/environments";
import { rolesStore } from "@/modules/chat/stores/roles";
import { providersStore } from "@/modules/chat/stores/providers";
import { draftsStore } from "@/modules/chat/stores/drafts";
import { threadsStore } from "@/modules/chat/stores/threads";
import { notesStore } from "@/modules/projects/stores/notes";
import { inboxStore } from "@/modules/inbox/stores/inbox";

const calls = vi.hoisted(() => ({
	placement: vi.fn(),
	environments: vi.fn(),
	roles: vi.fn(),
	providers: vi.fn(),
	sessions: vi.fn(),
	notes: vi.fn(),
	inbox: vi.fn(),
	count: vi.fn(),
}));
vi.mock("@/lib/runner-client", () => ({ runnerCall: () => calls.placement() }));
vi.mock("@/modules/chat/services/chat.service", () => ({
	chatService: {
		roles: () => calls.roles(),
		providers: () => calls.providers(),
		sessions: () => calls.sessions(),
	},
}));
vi.mock("@/modules/projects/services/projects.service", () => ({
	projectsService: { listNotes: () => calls.notes() },
}));
vi.mock("@/modules/environments/services/environments.service", () => ({
	environmentsService: { list: () => calls.environments() },
}));
vi.mock("@/modules/inbox/services/inbox.service", () => ({
	inboxService: { list: () => calls.inbox(), unread: () => calls.count() },
}));
const readAll = () =>
	Promise.all([
		placementsStore.load("first"),
		environmentsStore.load("first"),
		rolesStore.load("first"),
		providersStore.load("first"),
		threadsStore.load("first", "alpha"),
		notesStore.load("first", "alpha"),
		inboxStore.load("first"),
	]);
beforeEach(() => {
	localStore.setUser(null);
	for (const call of Object.values(calls)) call.mockReset().mockResolvedValue([]);
	calls.placement.mockResolvedValue({});
	calls.inbox.mockResolvedValue({ items: [], unread: 0, github: false });
	localStore.setUser("first");
});
describe("account-scoped shared stores", () => {
	it("clears the previous account's routing, roles, inbox and drafts when the account changes", async () => {
		calls.placement.mockResolvedValue({ alpha: "private-machine" });
		calls.environments.mockResolvedValue([
			{ id: "private-machine", label: "Private", url: "https://private.example", createdAt: "now" },
		]);
		calls.roles.mockResolvedValue([{ id: "private-role", brief: "Private project instructions" }]);
		calls.providers.mockResolvedValue([{ id: "codex" }]);
		calls.sessions.mockResolvedValue([
			{ id: "private-thread", project: "alpha", updatedAt: "now" },
		]);
		calls.notes.mockResolvedValue([
			{ id: "private-note", body: "Private note", shared: true, updatedAt: "now" },
		]);
		calls.inbox.mockResolvedValue({
			items: [{ id: "private-item", createdAt: "now" }],
			unread: 1,
			github: true,
		});
		await readAll();
		draftsStore.set("alpha", "Private draft");
		localStore.setUser("second");
		flush();
		expect(placementsStore.placements()).toEqual({});
		expect(environmentsStore.environments()).toEqual([]);
		expect(rolesStore.roles()).toEqual([]);
		expect(providersStore.providers()).toEqual([]);
		expect(threadsStore.threads("alpha")).toEqual([]);
		expect(notesStore.notes("alpha")).toEqual([]);
		expect(notesStore.loaded("alpha")).toBe(false);
		expect(inboxStore.items()).toEqual([]);
		expect(inboxStore.unread()).toBe(0);
		expect(draftsStore.take("alpha")).toBeUndefined();
	});

	it("drops late reads after the account changes", async () => {
		const answers: ((value: unknown) => void)[] = [];
		for (const call of Object.values(calls))
			call.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
		const reading = readAll();
		for (let n = 0; n < 8; n++) await Promise.resolve();
		localStore.setUser("second");
		flush();
		for (const answer of answers) answer([]);
		await reading;
		expect(rolesStore.loaded()).toBe(false);
		expect(threadsStore.loaded("alpha")).toBe(false);
		expect(notesStore.loaded("alpha")).toBe(false);
		expect(inboxStore.loaded()).toBe(false);
	});
});
