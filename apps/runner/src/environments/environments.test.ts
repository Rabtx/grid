import { afterAll, describe, expect, it } from "bun:test";

import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { readConfig } from "../config";
import { spawnPty } from "../pty";
import { startServer } from "../server";
import { TerminalStore } from "../terminals";
import { isEnvironmentToken, PairingStore } from "./pairing";
import { checkEnvironmentUrl, EnvironmentStore } from "./registry";

/**
 * Two real runners on loopback: "away" (a Codespace, say) takes part in pairing, and "home" is
 * the Grid the person signs in to. Home signs in its own users; away knows none of them, only
 * the pairing token home presents.
 */
const config = { ...readConfig({}), port: 0, shell: "/bin/sh" };

const awayPairing = new PairingStore(":memory:");
const awayTerminals = new TerminalStore(config, spawnPty);
const away = startServer(
	config,
	awayTerminals,
	async (token) => (isEnvironmentToken(token) ? awayPairing.verify(token) : null),
	new ChatHub(new ChatStore(":memory:"), new Map()),
	{ pairing: awayPairing },
);
const awayUrl = `http://127.0.0.1:${away.port}`;

const homeTerminals = new TerminalStore(config, spawnPty);
const home = startServer(
	config,
	homeTerminals,
	async (token) => (token === "alice" ? "user-a" : token === "bob" ? "user-b" : null),
	new ChatHub(new ChatStore(":memory:"), new Map()),
	{
		environments: {
			store: new EnvironmentStore(":memory:"),
			// Loopback stands in for the tailnet here.
			checkUrl: (raw) => new URL(raw),
		},
	},
);
const homeUrl = `http://127.0.0.1:${home.port}`;

afterAll(() => {
	awayTerminals.closeAll();
	homeTerminals.closeAll();
	void away.stop(true);
	void home.stop(true);
});

function as(token: string, init: RequestInit = {}): RequestInit {
	return {
		...init,
		headers: {
			...init.headers,
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
	};
}

async function pairAway(token: string): Promise<string> {
	const response = await fetch(
		`${homeUrl}/environments`,
		as(token, {
			method: "POST",
			body: JSON.stringify({ url: awayUrl, code: awayPairing.newCode(), label: "Codespace" }),
		}),
	);
	expect(response.status).toBe(201);
	return ((await response.json()) as { data: { id: string } }).data.id;
}

describe("pairing", () => {
	it("trades a code once, for the person who asked, and refuses wrong codes", () => {
		const store = new PairingStore(":memory:");
		const code = store.newCode();
		expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
		expect(store.pair("WRON-GCOD", "Home", "u1")).toBeNull();
		const paired = store.pair(code.toLowerCase().replace("-", " "), "Home", "u1");
		expect(paired).not.toBeNull();
		expect(store.pair(code, "Home", "u1")).toBeNull();

		const token = `grid-env.${paired?.peerId}.${paired?.secret}`;
		expect(store.verify(token)).toBe("u1");
		expect(store.verify(`grid-env.${paired?.peerId}.wrong`)).toBeNull();
		expect(store.verify(`${token}.someone-else`)).toBeNull();
		expect(store.unpair(token)).toBe(true);
		expect(store.verify(token)).toBeNull();
	});

	it("voids every outstanding code after ten wrong guesses", () => {
		const store = new PairingStore(":memory:");
		const code = store.newCode();
		for (let guess = 0; guess < 10; guess++) store.pair("AAAA-AAAA", "x", "u1");
		expect(store.pair(code, "x", "u1")).toBeNull();
	});

	it("expires a code after ten minutes", () => {
		let now = 1_000_000;
		const store = new PairingStore(":memory:", () => now);
		const code = store.newCode();
		now += 10 * 60 * 1000 + 1;
		expect(store.pair(code, "x", "u1")).toBeNull();
	});
});

describe("checkEnvironmentUrl", () => {
	it("accepts tailnet addresses and refuses the rest unless allowed over https", () => {
		expect(checkEnvironmentUrl("my-codespace.tail06599f.ts.net:4100", []).origin).toBe(
			"http://my-codespace.tail06599f.ts.net:4100",
		);
		expect(checkEnvironmentUrl("http://100.101.7.9:4100", []).hostname).toBe("100.101.7.9");
		expect(() => checkEnvironmentUrl("http://169.254.169.254/", [])).toThrow("tailnet");
		expect(() => checkEnvironmentUrl("http://localhost:4100", [])).toThrow("tailnet");
		expect(() => checkEnvironmentUrl("http://100.200.1.1:4100", [])).toThrow("tailnet");
		expect(() => checkEnvironmentUrl("http://vps.example.com", ["vps.example.com"])).toThrow(
			"https",
		);
		expect(checkEnvironmentUrl("https://vps.example.com", ["vps.example.com"]).host).toBe(
			"vps.example.com",
		);
		expect(() => checkEnvironmentUrl("http://user:pw@a.ts.net/", [])).toThrow("address");
	});
});

describe("environments through the home runner", () => {
	it("pairs with a code and lists the environment only for its owner", async () => {
		const id = await pairAway("alice");
		const mine = (await (await fetch(`${homeUrl}/environments`, as("alice"))).json()) as {
			data: { id: string; label: string; url: string }[];
		};
		expect(mine.data.find((environment) => environment.id === id)).toMatchObject({
			label: "Codespace",
			url: awayUrl,
		});
		expect(JSON.stringify(mine)).not.toContain("secret");
		const theirs = (await (await fetch(`${homeUrl}/environments`, as("bob"))).json()) as {
			data: unknown[];
		};
		expect(theirs.data).toEqual([]);
		expect((await fetch(`${homeUrl}/env/${id}/terminals`, as("bob"))).status).toBe(404);
	});

	it("refuses a wrong code without saving anything", async () => {
		const response = await fetch(
			`${homeUrl}/environments`,
			as("alice", { method: "POST", body: JSON.stringify({ url: awayUrl, code: "NOPE-NOPE" }) }),
		);
		expect(response.status).toBe(403);
	});

	it("runs a terminal on the environment, over HTTP and a relayed socket", async () => {
		const id = await pairAway("alice");
		const opened = await fetch(
			`${homeUrl}/env/${id}/terminals`,
			as("alice", { method: "POST", body: JSON.stringify({ cols: 80, rows: 24 }) }),
		);
		expect(opened.status).toBe(201);
		const terminal = ((await opened.json()) as { data: { id: string } }).data.id;
		// It lives on the environment, as the person who paired it.
		expect(awayTerminals.list("user-a").map((item) => item.id)).toContain(terminal);
		expect(homeTerminals.list("user-a")).toEqual([]);

		const ws = new WebSocket(`ws://127.0.0.1:${home.port}/env/${id}/terminal`);
		ws.binaryType = "arraybuffer";
		await new Promise((resolve) => ws.addEventListener("open", resolve));
		const output = new Promise<string>((resolve, reject) => {
			let seen = "";
			const timer = setTimeout(() => reject(new Error(`no output in: ${seen}`)), 5000);
			ws.addEventListener("message", (event) => {
				if (typeof event.data === "string") return;
				seen += new TextDecoder().decode(event.data as ArrayBuffer);
				if (seen.includes("away-says-hi")) {
					clearTimeout(timer);
					resolve(seen);
				}
			});
		});
		ws.send(JSON.stringify({ t: "hello", token: "alice", id: terminal, cols: 80, rows: 24 }));
		ws.send(new TextEncoder().encode("echo away-says-$((1+0))hi | sed s/1//\r"));
		expect(await output).toContain("away-says-hi");
		ws.close();
	});

	it("refuses a relayed socket without the person's own sign-in", async () => {
		const id = await pairAway("alice");
		for (const token of ["bad", "bob"]) {
			const ws = new WebSocket(`ws://127.0.0.1:${home.port}/env/${id}/terminal`);
			const closed = new Promise<number>((resolve) =>
				ws.addEventListener("close", (event) => resolve(event.code)),
			);
			await new Promise((resolve) => ws.addEventListener("open", resolve));
			ws.send(JSON.stringify({ t: "hello", token, id: "x" }));
			expect(await closed).toBe(token === "bad" ? 4401 : 4404);
		}
	});

	it("ends the pairing on both sides when the environment is removed", async () => {
		const before = awayPairing.peers().length;
		const id = await pairAway("alice");
		expect(awayPairing.peers()).toHaveLength(before + 1);
		const removed = await fetch(`${homeUrl}/environments/${id}`, as("alice", { method: "DELETE" }));
		expect(removed.status).toBe(204);
		expect(awayPairing.peers()).toHaveLength(before);
		expect((await fetch(`${homeUrl}/env/${id}/terminals`, as("alice"))).status).toBe(404);
	});

	it("never lets the environment's own routes be reached without a pairing", async () => {
		expect((await fetch(`${awayUrl}/terminals`, as("alice"))).status).toBe(401);
		expect((await fetch(`${awayUrl}/terminals`, as("grid-env.x.y"))).status).toBe(401);
	});
});
