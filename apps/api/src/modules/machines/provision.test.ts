import { describe, expect, it } from "bun:test";

import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";
import {
	containerName,
	createDockerProvisioner,
	dockerRunArgs,
	type CommandRunner,
	volumeName,
} from "./provision";

const SECRET = "test-secret-that-is-at-least-32-characters";
const config = createConfig(parseEnv({ NODE_ENV: "test", JWT_SECRET: SECRET }));

const spec = {
	id: "11111111-1111-4111-8111-111111111111",
	workspaceId: "22222222-2222-4222-8222-222222222222",
	name: "Ada",
	port: 4301,
	enrollmentCode: "gme_test-code",
};

describe("managed machine containers", () => {
	it("publishes only on loopback and shares nothing of the host", () => {
		const args = dockerRunArgs(config, spec);
		const line = args.join(" ");
		expect(args).toContain("127.0.0.1:4301:4100");
		expect(args).toContain("--cap-drop");
		expect(args).toContain("ALL");
		expect(args).toContain("--read-only");
		expect(args).toContain("no-new-privileges");
		expect(args).toContain(`${volumeName(spec.id)}:/home/grid`);
		expect(args).toContain(`GRID_ENROLLMENT_CODE=${spec.enrollmentCode}`);
		expect(args).toContain("--name");
		expect(args).toContain(containerName(spec.id));
		expect(line).not.toContain("--privileged");
		expect(line).not.toContain("docker.sock");
		expect(line).not.toContain("--network");
		expect(line).not.toContain("/var/run");
		// The only mount is the machine's own named volume. A host path would start with `/`.
		const mounts = args.filter((_, index) => args[index - 1] === "-v");
		expect(mounts).toEqual([`${volumeName(spec.id)}:/home/grid`]);
		expect(mounts.every((mount) => !mount.startsWith("/"))).toBe(true);
		expect(args.at(-1)).toBe("grid-runner:latest");
	});

	it("refuses a rootful Docker daemon", async () => {
		const run: CommandRunner = async (args) => {
			if (args[0] === "version") return { code: 0, stdout: "27.0.0\n", stderr: "" };
			if (args[0] === "info") return { code: 0, stdout: '["name=seccomp"]\n', stderr: "" };
			return { code: 1, stdout: "", stderr: "not called" };
		};
		const availability = await createDockerProvisioner(config, run).available();
		expect(availability.available).toBe(false);
		expect(availability.reason).toContain("rootless");
	});

	it("accepts rootless Docker", async () => {
		const run: CommandRunner = async (args) => {
			if (args[0] === "version") return { code: 0, stdout: "27.0.0\n", stderr: "" };
			if (args[0] === "info")
				return { code: 0, stdout: '["name=seccomp","name=rootless"]\n', stderr: "" };
			return { code: 1, stdout: "", stderr: "not called" };
		};
		expect((await createDockerProvisioner(config, run).available()).available).toBe(true);
	});

	it("removes the container and its volume", async () => {
		const calls: string[][] = [];
		const run: CommandRunner = async (args) => {
			calls.push(args);
			return { code: 0, stdout: "", stderr: "" };
		};
		await createDockerProvisioner(config, run).remove(spec.id);
		expect(calls).toEqual([
			["rm", "-f", containerName(spec.id)],
			["volume", "rm", "-f", volumeName(spec.id)],
		]);
	});
});
