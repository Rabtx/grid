import { afterEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { claudeProvider } from "../agents/claude";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { Sandboxes, sandboxCommand, sandboxFor } from "./sandbox";
import { sandboxRequest } from "./routes";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const fn of cleanup.splice(0).reverse()) fn();
});

function temp(name: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), `grid-sandbox-${name}-`)));
	cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

const git = (cwd: string, ...args: string[]) => {
	const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
};

/**
 * A stand-in for the docker CLI: `version` answers (or not, with `FAKE_DOCKER_DOWN`), `run` notes
 * its arguments and runs the command after the image as the container would (in `--workdir`,
 * with only the environment `-e` passes), `rm -f` notes what it removed.
 */
function fakeDocker(dir: string, bin: string): { docker: string; log: string } {
	const log = join(dir, "docker.log");
	const docker = join(dir, "docker");
	writeFileSync(
		docker,
		`#!/usr/bin/env bash
echo "$*" >> ${JSON.stringify(log)}
case "$1" in
  version) [ -n "$FAKE_DOCKER_DOWN" ] && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }; echo 29.0.0; exit 0 ;;
  image) exit 0 ;;
  rm) exit 0 ;;
esac
shift
workdir=""; envs=()
while [ $# -gt 0 ]; do
  case "$1" in
    --rm|-i) shift ;;
    --name|--network|--user|-v|--tmpfs) shift 2 ;;
    --workdir) workdir="$2"; shift 2 ;;
    -e) if [[ "$2" == *=* ]]; then envs+=("$2"); else envs+=("$2=\${!2}"); fi; shift 2 ;;
    *) break ;;
  esac
done
shift # the image
cd "$workdir" && exec env -i PATH=${JSON.stringify(bin)}:/usr/bin:/bin "\${envs[@]}" "$@"
`,
	);
	chmodSync(docker, 0o755);
	return { docker, log };
}

describe("a sandbox's container", () => {
	it("sees the thread's repository and its worktree's git folder, the agent's state and nothing else", () => {
		const home = temp("home");
		mkdirSync(join(home, ".claude"));
		writeFileSync(join(home, ".gitconfig"), "[user]\n\tname = Ana\n");
		const repo = temp("repo");
		git(repo, "init", "-q");
		git(
			repo,
			"-c",
			"user.name=a",
			"-c",
			"user.email=a@b",
			"commit",
			"-q",
			"--allow-empty",
			"-m",
			"x",
		);
		const tree = join(temp("trees"), "chat");
		git(repo, "worktree", "add", "-q", "-b", "grid/chat", tree);
		const accountDir = temp("account");
		const sandbox = sandboxFor({
			image: "grid-sandbox",
			cwd: tree,
			home,
			env: { CLAUDE_CONFIG_DIR: accountDir, GIT_AUTHOR_NAME: "Ana" },
			runner: [process.execPath],
		});
		const mounts = Object.fromEntries(sandbox.mounts.map((mount) => [mount.path, mount.readOnly]));
		expect(mounts[tree]).toBe(false);
		expect(mounts[join(repo, ".git")]).toBe(false);
		expect(mounts[join(home, ".claude")]).toBe(false);
		expect(mounts[join(home, ".gitconfig")]).toBe(true);
		expect(mounts[realpathSync(process.execPath)]).toBe(true);
		expect(mounts[accountDir]).toBe(false);
		// Not the rest of the home folder, and not the repository's other files.
		expect(mounts[home]).toBeUndefined();
		expect(mounts[repo]).toBeUndefined();
	});

	it("is run by name from the image, with the environment passed by name only", () => {
		const command = sandboxCommand(
			["/home/ana/.local/bin/claude", "--print"],
			{ cwd: "/work/web", env: { CLAUDE_CODE_OAUTH_TOKEN: "secret" }, inherited: ["HTTPS_PROXY"] },
			{
				image: "grid-sandbox",
				name: "grid-1",
				mounts: [{ path: "/work/web", readOnly: false }],
				user: "1000:1000",
				home: "/home/ana",
			},
		);
		expect(command.join(" ")).toBe(
			"docker run --rm -i --name grid-1 --network host --workdir /work/web --tmpfs /home/ana:rw,exec,mode=1777 -e HOME=/home/ana -e NO_COLOR --user 1000:1000 -e HTTPS_PROXY -e CLAUDE_CODE_OAUTH_TOKEN -v /work/web:/work/web grid-sandbox claude --print",
		);
		expect(command.join(" ")).not.toContain("secret");
	});
});

describe("sandboxed threads", () => {
	function setup(options: { down?: boolean } = {}) {
		const root = temp("root");
		const bin = join(root, "bin");
		mkdirSync(bin);
		// The image's `claude`: Grid's stand-in, by name on the container's PATH.
		const fake = join(import.meta.dir, "..", "chaos", "fake-claude.ts");
		writeFileSync(
			join(bin, "claude"),
			`#!/usr/bin/env bash\nexec ${process.execPath} ${fake} "$@"\n`,
		);
		chmodSync(join(bin, "claude"), 0o755);
		const { docker, log } = fakeDocker(root, bin);
		const before = { docker: process.env.GRID_DOCKER, down: process.env.FAKE_DOCKER_DOWN };
		process.env.GRID_DOCKER = docker;
		if (options.down) process.env.FAKE_DOCKER_DOWN = "1";
		cleanup.push(() => {
			process.env.GRID_DOCKER = before.docker;
			if (before.docker === undefined) delete process.env.GRID_DOCKER;
			if (before.down === undefined) delete process.env.FAKE_DOCKER_DOWN;
		});
		const folder = join(root, "web");
		mkdirSync(folder);
		const store = new ChatStore(join(root, "chat.db"));
		const provider = claudeProvider({ binary: "/nowhere/claude", available: () => true });
		const hub = new ChatHub(store, new Map([["claude", provider]]), root);
		const sandboxes = new Sandboxes({ image: () => "grid-sandbox:test", docker });
		hub.setSandboxes(sandboxes);
		hub.linkProjectFolder("acme", "web", folder);
		cleanup.push(() => {
			for (const row of store.list("acme", "web")) hub.delete("acme", row.id);
			store.close();
		});
		return { hub, sandboxes, folder, log };
	}
	const who = { userId: "ana", workspace: "acme" };

	it("run the agent in a container from the image, and answer as on the machine", async () => {
		const { hub, folder, log } = setup();
		const session = hub.create(who, {
			project: "web",
			provider: "claude",
			cwd: folder,
			sandbox: true,
		});
		expect(session.sandbox).toEqual({ image: "grid-sandbox:test" });
		await hub.prompt("acme", session.id, "hello from the box");
		const reply = hub
			.events("acme", session.id)
			.filter((event) => event.type === "message")
			.map((event) => (event as { text: string }).text)
			.join("");
		expect(reply).toContain("ok: hello from the box");
		const runs = readFileSync(log, "utf8")
			.split("\n")
			.filter((line) => line.startsWith("run "));
		expect(runs.length).toBeGreaterThan(0);
		expect(runs.every((line) => line.includes(`-v ${folder}:${folder}`))).toBe(true);
		expect(runs.every((line) => line.includes("grid-sandbox:test claude"))).toBe(true);
	});

	it("follow the project's setting, and are refused when Docker is not there to run them", () => {
		const { hub, folder } = setup({ down: true });
		expect(() =>
			hub.create(who, { project: "web", provider: "claude", cwd: folder, sandbox: true }),
		).toThrow("Docker is not running here");
		hub.setProjectSettings("acme", "web", { worktrees: false, sandbox: true });
		expect(() => hub.create(who, { project: "web", provider: "claude", cwd: folder })).toThrow(
			"start the thread without a sandbox",
		);
		// Asked for without one, it runs on the machine.
		expect(
			hub.create(who, { project: "web", provider: "claude", cwd: folder, sandbox: false }).sandbox,
		).toBeNull();
	});

	it("say whether Docker is there, and which image", async () => {
		const { sandboxes } = setup();
		const url = new URL("http://runner/sandbox?fresh=1");
		const response = sandboxRequest(new Request(url.href), url, sandboxes);
		expect(await response?.json()).toEqual({
			data: { available: true, reason: null, image: "grid-sandbox:test", imageReady: true },
		});
	});
});
