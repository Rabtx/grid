import { createServer } from "node:net";

import type { AppConfig } from "../../config/config";

/** What the provisioner needs to start one team-managed machine. */
export type ManagedMachineSpec = {
	id: string;
	workspaceId: string;
	name: string;
	port: number;
	enrollmentCode: string;
};

export type ProvisionAvailability = { available: boolean; reason: string | null };

/** The part of machine provisioning the API routes use; tests replace it with a fake. */
export type MachineProvisioner = {
	available(): Promise<ProvisionAvailability>;
	create(spec: ManagedMachineSpec): Promise<void>;
	remove(id: string): Promise<void>;
};

export type CommandResult = { code: number; stdout: string; stderr: string };
export type CommandRunner = (args: string[]) => Promise<CommandResult>;

const CONTAINER_PREFIX = "grid-machine-";
const VOLUME_PREFIX = "grid-machine-";
const RUNNER_PORT = 4100;
/** How long a Docker answer is trusted before asking again. */
const AVAILABILITY_TTL_MS = 15_000;

export function containerName(id: string): string {
	return `${CONTAINER_PREFIX}${id}`;
}

export function volumeName(id: string): string {
	return `${VOLUME_PREFIX}${id}`;
}

/** The loopback address the hosted runner uses to reach a managed machine. */
export function managedAddress(config: AppConfig, port: number): string {
	return `http://${config.machines.addressHost}:${port}`;
}

/**
 * The hardened `docker run` for one machine. Rootless Docker already maps container root to the
 * host user; the container additionally drops every capability, is read-only outside its home
 * volume and `/tmp`, and publishes its runner only on loopback. It has no host mounts, so a
 * machine never sees the team server's files, Docker socket or other machines.
 */
export function dockerRunArgs(config: AppConfig, spec: ManagedMachineSpec): string[] {
	const settings = config.machines;
	const args = [
		"run",
		"-d",
		"--name",
		containerName(spec.id),
		"--restart",
		"unless-stopped",
		"--stop-timeout",
		"30",
		"--label",
		`grid.machine=${spec.id}`,
		"--label",
		`grid.workspace=${spec.workspaceId}`,
		"--security-opt",
		"no-new-privileges",
		"--cap-drop",
		"ALL",
		"--read-only",
		"--tmpfs",
		"/tmp:rw,nosuid,nodev,size=256m",
		"--pids-limit",
		String(settings.pidsLimit),
		"--memory",
		`${settings.memoryMb}m`,
		"--cpus",
		String(settings.cpus),
		"--add-host",
		"host.docker.internal:host-gateway",
		"-p",
		`${settings.addressHost}:${spec.port}:${RUNNER_PORT}`,
		"-v",
		`${volumeName(spec.id)}:/home/grid`,
		"-e",
		"HOME=/home/grid",
		"-e",
		"XDG_DATA_HOME=/home/grid/.local/share",
		"-e",
		`GRID_API_URL=${settings.controlUrl}`,
		"-e",
		`GRID_ENROLLMENT_CODE=${spec.enrollmentCode}`,
		"-e",
		`GRID_MACHINE_ADDRESS=${managedAddress(config, spec.port)}`,
		"-e",
		"RUNNER_SHARED=1",
		"-e",
		"RUNNER_HOST=0.0.0.0",
		"-e",
		`RUNNER_PORT=${RUNNER_PORT}`,
		"-e",
		"RUNNER_PROJECTS_DIR=/home/grid/Projects",
		"-e",
		"NO_COLOR=1",
	];
	if (settings.network) args.push("--network", settings.network);
	args.push(settings.image);
	return args;
}

/** A port nothing is listening on right now. */
export async function portFree(port: number, host = "127.0.0.1"): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once("error", () => resolve(false));
		server.listen(port, host, () => server.close(() => resolve(true)));
	});
}

function dockerCommand(bin: string): CommandRunner {
	return async (args) => {
		const child = Bun.spawn([bin, ...args], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		return { code, stdout, stderr };
	};
}

/**
 * Team-managed machines on this host's Docker. The API asks whether Docker is there and rootless
 * before offering the action; a rootful daemon is refused unless an operator explicitly opts in.
 */
export function createDockerProvisioner(
	config: AppConfig,
	run: CommandRunner = dockerCommand(config.machines.docker),
): MachineProvisioner {
	let cached: { at: number; value: ProvisionAvailability } | null = null;

	async function ask(): Promise<ProvisionAvailability> {
		if (!config.machines.managed)
			return { available: false, reason: "Team-managed machines are turned off" };
		const version = await run(["version", "--format", "{{.Server.Version}}"]).catch(() => null);
		if (!version || version.code !== 0)
			return {
				available: false,
				reason: "Docker is not available on this Grid server",
			};
		if (!config.machines.allowRootful) {
			const info = await run(["info", "--format", "{{json .SecurityOptions}}"]).catch(() => null);
			if (!info || info.code !== 0 || !/rootless/i.test(info.stdout))
				return {
					available: false,
					reason:
						"Docker must run rootless to host team machines (set MACHINES_ALLOW_ROOTFUL=1 to allow rootful)",
				};
		}
		return { available: true, reason: null };
	}

	return {
		async available() {
			const now = Date.now();
			if (cached && now - cached.at < AVAILABILITY_TTL_MS) return cached.value;
			const value = await ask();
			cached = { at: now, value };
			return value;
		},
		async create(spec) {
			const result = await run(dockerRunArgs(config, spec));
			if (result.code !== 0)
				throw new Error(
					`Docker could not start the machine: ${result.stderr.trim() || `exit ${result.code}`}`,
				);
			cached = null;
		},
		async remove(id) {
			const result = await run(["rm", "-f", containerName(id)]);
			if (result.code !== 0 && !/no such container/i.test(result.stderr))
				throw new Error(
					`Docker could not remove the machine: ${result.stderr.trim() || `exit ${result.code}`}`,
				);
			const volume = await run(["volume", "rm", "-f", volumeName(id)]);
			if (volume.code !== 0 && !/no such volume/i.test(volume.stderr))
				throw new Error(
					`Docker could not remove the machine's files: ${volume.stderr.trim() || `exit ${volume.code}`}`,
				);
			cached = null;
		},
	};
}
