/**
 * A stand-in for the Claude Code CLI, speaking its stream-json protocol, for the chaos tests and
 * the console's end-to-end tests: the runner starts it as `claude` from PATH. What a turn does is
 * read from its message: `SLOW:<ms>` works that long (a turn to kill the runner in), `APPROVE`
 * asks to run a command and waits for the answer, `LINK:<id>` answers with a link to that thread,
 * `COST:<usd>` adds that much to what it reports having cost; anything else is answered at once.
 * Grid's carry-on message is answered "carried on" (after `FAKE_CLAUDE_CONTINUE_MS`, when set).
 */
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const resumeAt = args.indexOf("--resume");
const session = resumeAt >= 0 ? (args[resumeAt + 1] ?? crypto.randomUUID()) : crypto.randomUUID();
let interrupted = false;
/** What this process has cost so far, as Claude Code reports it: a running total. */
let costUsd = 0;
/** The answer a `can_use_tool` request waits for. */
const waiting: { answer: ((answer: Record<string, unknown>) => void) | null } = { answer: null };

const send = (message: Record<string, unknown>) =>
	process.stdout.write(`${JSON.stringify({ ...message, session_id: session })}\n`);
const say = (text: string) =>
	send({
		type: "stream_event",
		event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
	});
const finish = (text: string) => {
	send({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
	send({
		type: "result",
		subtype: "success",
		is_error: false,
		result: text,
		usage: { input_tokens: 10, output_tokens: 5 },
		total_cost_usd: costUsd,
	});
};

async function turn(text: string): Promise<void> {
	interrupted = false;
	costUsd += Number(/COST:([\d.]+)/.exec(text)?.[1] ?? 0);
	send({
		type: "system",
		subtype: "init",
		cwd: process.cwd(),
		model: "fake",
		permissionMode: "default",
	});
	if (/runner restarted/i.test(text) && !/SLOW:|APPROVE/.test(text)) {
		// FAKE_CLAUDE_CONTINUE_MS: carrying on takes that long (a runner that keeps crashing).
		const until = Date.now() + Number(process.env.FAKE_CLAUDE_CONTINUE_MS ?? 0);
		while (Date.now() < until && !interrupted) await Bun.sleep(100);
		say("carried on");
		finish("carried on");
		return;
	}
	const slow = /SLOW:(\d+)/.exec(text);
	if (slow) {
		const until = Date.now() + Number(slow[1]);
		while (Date.now() < until && !interrupted) {
			say("working… ");
			await Bun.sleep(100);
		}
		finish(interrupted ? "stopped" : "slow done");
		return;
	}
	if (text.includes("APPROVE")) {
		const id = crypto.randomUUID();
		send({
			type: "assistant",
			message: {
				role: "assistant",
				content: [{ type: "tool_use", id: "tool-1", name: "Bash", input: { command: "echo hi" } }],
			},
		});
		const answer = await new Promise<Record<string, unknown>>((resolve) => {
			waiting.answer = resolve;
			send({
				type: "control_request",
				request_id: id,
				request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "echo hi" } },
			});
		});
		const allowed = (answer.response as { behavior?: string })?.behavior === "allow";
		send({
			type: "user",
			message: {
				role: "user",
				content: [
					{ type: "tool_result", tool_use_id: "tool-1", content: allowed ? "hi" : "denied" },
				],
			},
		});
		say(allowed ? "ran it" : "did not run it");
		finish(allowed ? "ran it" : "did not run it");
		return;
	}
	const link = /LINK:([\w-]+)/.exec(text);
	if (link) {
		const reply = `See [the earlier thread](grid-thread://${link[1]}).`;
		say(reply);
		finish(reply);
		return;
	}
	// The message's last line: what was asked, after any note Grid put before it.
	const reply = `ok: ${text.trim().split("\n").at(-1)?.slice(-60) ?? ""}`;
	say(reply);
	finish(reply);
}

let queue = Promise.resolve();
for await (const line of createInterface({ input: process.stdin })) {
	if (!line.trim()) continue;
	const message = JSON.parse(line) as Record<string, unknown>;
	if (message.type === "control_request") {
		const request = message.request as { subtype?: string };
		if (request.subtype === "interrupt") interrupted = true;
		send({
			type: "control_response",
			response: {
				subtype: "success",
				request_id: message.request_id,
				response: request.subtype === "initialize" ? { commands: [], models: [] } : {},
			},
		});
		continue;
	}
	if (message.type === "control_response") {
		waiting.answer?.(message.response as Record<string, unknown>);
		waiting.answer = null;
		continue;
	}
	if (message.type === "user") {
		const content = (message.message as { content: { type: string; text?: string }[] }).content;
		const text = content.find((block) => block.type === "text")?.text ?? "";
		queue = queue.then(() => turn(text));
	}
}
// Its input closed: the runner that started it is gone (killed, in the chaos tests). Claude Code
// exits then rather than finishing the turn for nobody, and so does this.
process.exit(0);
