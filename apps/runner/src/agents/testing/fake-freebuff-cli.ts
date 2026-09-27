/**
 * A stand-in for the Freebuff CLI in tests, drawn the way the real one draws: a full-screen UI
 * redrawn in place that opens on its input box, a `/model` picker (Tab for reasoning), the line
 * under the input naming the model, echoed messages, a streamed reply and its chat file. Only the
 * parts the adapter reads are imitated.
 *
 * FAKE_REPLY_LINES sets how many numbered rows a reply has (enough to scroll off a short screen).
 * FAKE_STATE_DIR is where it keeps its chat file, as the real CLI keeps one under
 * `~/.config/manicode`. FAKE_NO_ECHO draws replies without the echo of the message, a screen the
 * adapter cannot follow; FAKE_NO_COMPLETE saves replies without marking them complete.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

type Model = { name: string; traits: string; price: string; effort?: string };

const MODELS: Model[] = [
	{ name: "Solar Mini 4", traits: "Fast and light · NEW", price: "5 Freebucks/hr" },
	{
		name: "DeepSeek V4.1 Flash",
		traits: "Smart & Fast · Images · NEW",
		price: "15 Freebucks/hr",
		effort: "max",
	},
	{
		name: "Gemini 3.8 Flash",
		traits: "1M context · Images",
		price: "80 Freebucks/hr",
		effort: "high",
	},
];
const LEVELS = ["low", "high", "max"];
const replyLines = Number(process.env.FAKE_REPLY_LINES ?? 3);
const stateDir = process.env.FAKE_STATE_DIR;
const noEcho = Boolean(process.env.FAKE_NO_ECHO);
// Newer builds save the reply without marking it complete.
const markComplete = !process.env.FAKE_NO_COMPLETE;
const continued = process.argv[process.argv.indexOf("--continue") + 1];
const chatId =
	process.argv.includes("--continue") && continued && !continued.startsWith("-")
		? continued
		: new Date().toISOString().replace(/:/g, "-");
const rows = process.stdout.rows || 40;

let view: "chat" | "picker" | "levels" = "chat";
let collapsed = true;
let current = 1;
let selected = 1;
let level = 0;
let input = "";
let status = "";
let session = false;
const log: string[] = [];
const exported: unknown[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

/** Keep the conversation where the real CLI does, as the reply is written. */
function save(): void {
	if (!stateDir) return;
	const dir = join(stateDir, "projects", basename(process.cwd()), "chats", chatId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "chat-messages.json"), JSON.stringify(exported));
}

function label(model: Model): string {
	return model.effort ? `${model.name} • ${model.effort}` : model.name;
}

function draw(): void {
	const shown = collapsed ? MODELS.slice(0, 2) : MODELS;
	const under = [
		` ${label(MODELS[current])} · ${process.cwd()} · /model to change · Chat: New chat`,
		" ← for history · ? for help",
	];
	let lines: string[];
	if (view === "picker") {
		lines = [" ↑↓ choose model · Tab reasoning · Enter select · Esc cancel"];
		shown.forEach((model, index) => {
			const mark = index === selected ? "› " : "  ";
			lines.push(`  ┌${"─".repeat(60)}┐`);
			lines.push(`  │ ${mark}${label(model).padEnd(22)}  ${model.traits}`.padEnd(63) + "│");
			lines.push(`  │ ${model.price.padStart(35)}`.padEnd(63) + "│");
			lines.push(`  └${"─".repeat(60)}┘`);
		});
		lines.push(collapsed ? "  ↓  See all 3 models" : "  ↑  Show fewer");
		lines.push("  STARTER · 80/105 Freebucks daily · 290 in wallet");
		lines.push(...under);
	} else if (view === "levels") {
		lines = [
			" ↑↓ choose · Enter save · Esc back",
			...LEVELS.map(
				(name, index) =>
					`  ${index === level ? "›" : " "} ${name}${name === "high" ? " (default)" : ""}`,
			),
			...under,
		];
	} else {
		const top = session
			? []
			: [
					" │ Your first message starts the session.",
					" │ 80/105 Freebucks remaining",
					" │ Starter plan",
				];
		const footer = [
			status || (session ? ` 1h left${" ".repeat(40)}✕ End session` : ""),
			`╭${"─".repeat(60)}╮`,
			`│  ▍${input || "Enter a coding task or / for commands"}`,
			`╰${"─".repeat(60)}╯`,
			...under,
		];
		const room = rows - footer.length - top.length;
		lines = [...top, ...log.slice(-room), ...footer];
	}
	process.stdout.write(`\x1b[H\x1b[2J${lines.slice(0, rows).join("\r\n")}`);
}

function send(text: string): void {
	if (text === "/model") {
		view = "picker";
		selected = current;
		return;
	}
	session = true;
	const sent = text.split("\n");
	if (!noEcho)
		log.push(
			"",
			"   [06:45 PM]",
			...sent.map((line, i) => `   ${line}${i === sent.length - 1 ? " ⎘" : ""}`),
			"",
		);
	exported.push({ id: `user-${Date.now()}`, variant: "user", content: text });
	const answer = { id: `ai-${Date.now()}`, variant: "ai", content: "", blocks: [] as unknown[] };
	exported.push(answer);
	save();
	const reply = Array.from({ length: replyLines }, (_, i) => `row ${i + 1}`);
	let written = 0;
	status = ` thinking...${" ".repeat(40)}1s  ■ Esc`;
	log.push("  • Thinking", "    Reading the request.", "");
	timer = setInterval(() => {
		if (written < reply.length) {
			log.push(`  ${reply[written]}`);
			written++;
			status = ` working...${" ".repeat(40)}2s  ■ Esc`;
		} else {
			clearInterval(timer);
			timer = undefined;
			log.push(`${" ".repeat(50)}⎘ • 2s • △▽`);
			status = "";
			answer.blocks = [
				{ type: "text", textType: "reasoning", content: "Reading the request." },
				{ type: "text", content: `**Exact** reply\n\n${reply.join("\n")}` },
			];
			if (markComplete) Object.assign(answer, { metadata: { isComplete: true } });
			save();
		}
		draw();
	}, 30);
}

function key(data: string): void {
	if (data === "\x03") process.exit(0);
	if (view === "picker") {
		const count = collapsed ? 2 : MODELS.length;
		if (data === "\x1b[A") selected = Math.max(0, selected - 1);
		else if (data === "\x1b[B") selected = Math.min(count, selected + 1);
		else if (data === "\x1b") view = "chat";
		else if (data === "\t" && MODELS[selected]?.effort) {
			view = "levels";
			level = LEVELS.indexOf(MODELS[selected].effort ?? "high");
		} else if (data === "\r") {
			if (selected === count && collapsed) collapsed = false;
			else if (selected < count) {
				current = selected;
				view = "chat";
			}
		}
		// The "See all" row is highlighted by moving past the last model.
		if (selected === count && !collapsed) selected = count - 1;
	} else if (view === "levels") {
		if (data === "\x1b[A") level = Math.max(0, level - 1);
		else if (data === "\x1b[B") level = Math.min(LEVELS.length - 1, level + 1);
		else if (data === "\x1b") view = "picker";
		else if (data === "\r") {
			MODELS[selected].effort = LEVELS[level];
			view = "picker";
		}
	} else if (data === "\x1b" && timer) {
		clearInterval(timer);
		timer = undefined;
		status = "";
		log.push("  [stopped]");
	} else if (data === "\r") {
		const text = input;
		input = "";
		if (text) send(text);
	} else if (data.startsWith("\x1b[200~")) {
		// oxlint-disable-next-line no-control-regex -- the paste markers are escape sequences
		input += data.replace(/\x1b\[20[01]~/g, "");
	} else if (!data.startsWith("\x1b")) {
		input += data;
	}
	draw();
}

process.stdin.setRawMode(true);
process.stdin.on("data", (chunk) => key(chunk.toString()));
setTimeout(draw, 50);
