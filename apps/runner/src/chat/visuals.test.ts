import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { readVisual } from "./visuals";

describe("inline visuals", () => {
	it("keeps blocks trimmed and without unset keys", () => {
		expect(
			readVisual({
				title: "  Build times ",
				blocks: [
					{ type: "bar-chart", unit: "s", items: [{ label: " web ", value: 42, highlight: true }] },
					{
						type: "tabs",
						tabs: [
							{ label: "A", blocks: [{ type: "markdown", text: "a" }] },
							{ label: "B", blocks: [{ type: "callout", tone: "warning", text: "b" }] },
						],
					},
				],
			}),
		).toEqual({
			title: "Build times",
			format: "components",
			blocks: [
				{ type: "bar-chart", unit: "s", items: [{ label: "web", value: 42, highlight: true }] },
				{
					type: "tabs",
					tabs: [
						{ label: "A", blocks: [{ type: "markdown", text: "a" }] },
						{ label: "B", blocks: [{ type: "callout", tone: "warning", text: "b" }] },
					],
				},
			],
		});
	});

	it("names the block that is wrong", () => {
		expect(() =>
			readVisual({
				title: "x",
				blocks: [
					{ type: "markdown", text: "ok" },
					{ type: "table", columns: [{ label: "a" }], rows: [[1, 2]] },
				],
			}),
		).toThrow("blocks[1].rows[0] must have one cell per column");
		expect(() =>
			readVisual({
				title: "x",
				blocks: [
					{
						type: "tabs",
						tabs: [
							{ label: "a", blocks: [{ type: "tabs" }] },
							{ label: "b", blocks: [] },
						],
					},
				],
			}),
		).toThrow("not a block Grid draws");
	});

	it("lets a calculator use only its inputs, outputs above it and the known functions", () => {
		const calculator = (formula: string) => ({
			title: "Cost",
			blocks: [
				{
					type: "calculator",
					inputs: [{ id: "seats", label: "Seats", value: 5 }],
					outputs: [
						{ id: "monthly", label: "Monthly", formula: "seats * 12" },
						{ label: "Yearly", formula },
					],
				},
			],
		});
		expect(() => readVisual(calculator("round(monthly * 12)"))).not.toThrow();
		expect(() => readVisual(calculator("price * 12"))).toThrow("uses price");
		expect(() => readVisual(calculator("seats; alert(1)"))).toThrow("formula may use");
	});

	it("takes one html page instead of blocks, with its height kept in bounds", () => {
		expect(readVisual({ title: "Diagram", html: "<svg></svg>", height: 99_999 })).toMatchObject({
			format: "html",
			height: 1200,
		});
		expect(() => readVisual({ title: "Both", html: "<p>", blocks: [] })).toThrow("exactly one");
	});
});

describe("Grid's tools server", () => {
	it("lists show_visual and hands a call to the runner with its key", async () => {
		const calls: { key: string | null; body: unknown }[] = [];
		const runner = Bun.serve({
			port: 0,
			fetch: async (request) => {
				calls.push({ key: request.headers.get("x-grid-tools-key"), body: await request.json() });
				return new Response(null, { status: 204 });
			},
		});
		const child = Bun.spawn([process.execPath, join(import.meta.dir, "grid-tools.ts")], {
			stdin: "pipe",
			stdout: "pipe",
			env: {
				...process.env,
				GRID_RUNNER_URL: `http://127.0.0.1:${runner.port}`,
				GRID_TOOLS_KEY: "secret",
				GRID_TOOLS_THREAD: "t1",
			},
		});
		const send = (message: unknown) => {
			child.stdin.write(`${JSON.stringify(message)}\n`);
			child.stdin.flush();
		};
		const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
		let buffer = "";
		const next = async (): Promise<Record<string, unknown>> => {
			while (!buffer.includes("\n")) {
				const { value, done } = await reader.read();
				if (done) throw new Error("tools server ended");
				buffer += new TextDecoder().decode(value);
			}
			const line = buffer.slice(0, buffer.indexOf("\n"));
			buffer = buffer.slice(buffer.indexOf("\n") + 1);
			return JSON.parse(line) as Record<string, unknown>;
		};
		try {
			send({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: { protocolVersion: "2025-06-18" },
			});
			expect(await next()).toMatchObject({ id: 1, result: { serverInfo: { name: "grid" } } });
			send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
			expect(await next()).toMatchObject({ id: 2, result: { tools: [{ name: "show_visual" }] } });
			send({
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: { name: "show_visual", arguments: { title: "x", blocks: [] } },
			});
			expect(await next()).toMatchObject({ id: 3, result: { isError: false } });
			expect(calls).toEqual([
				{ key: "secret", body: { thread: "t1", args: { title: "x", blocks: [] } } },
			]);
		} finally {
			child.kill();
			runner.stop(true);
		}
	});
});
