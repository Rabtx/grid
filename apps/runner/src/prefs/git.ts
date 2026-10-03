import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { GitPrefs } from "./store";

/** This machine's SSH key that commits can be signed with, as Settings shows it. */
export type SigningKey = { path: string; type: string; addedAt: string };

const KEYS = ["id_ed25519", "id_ecdsa", "id_rsa"] as const;

/** The first public SSH key in `~/.ssh`, or null when there is none to sign with. */
export function signingKey(home: string = homedir()): SigningKey | null {
	for (const name of KEYS) {
		const path = join(home, ".ssh", `${name}.pub`);
		if (!existsSync(path)) continue;
		return {
			path,
			type: name.replace(/^id_/, ""),
			addedAt: statSync(path).mtime.toISOString(),
		};
	}
	return null;
}

/**
 * What an agent's process is given so its commits are by the person who started it: their name
 * and email as author and committer, and SSH signing when they ask for it and the machine has a
 * key. Git reads `GIT_CONFIG_*` as if it were config, so the project's own config is untouched.
 */
export function gitEnvironment(prefs: GitPrefs, key: SigningKey | null): Record<string, string> {
	const env: Record<string, string> = {};
	if (prefs.name && prefs.email) {
		env.GIT_AUTHOR_NAME = prefs.name;
		env.GIT_AUTHOR_EMAIL = prefs.email;
		env.GIT_COMMITTER_NAME = prefs.name;
		env.GIT_COMMITTER_EMAIL = prefs.email;
	}
	if (prefs.signCommits && key) {
		const config: [string, string][] = [
			["gpg.format", "ssh"],
			["user.signingkey", key.path],
			["commit.gpgsign", "true"],
		];
		env.GIT_CONFIG_COUNT = String(config.length);
		config.forEach(([name, value], index) => {
			env[`GIT_CONFIG_KEY_${index}`] = name;
			env[`GIT_CONFIG_VALUE_${index}`] = value;
		});
	}
	return env;
}

/** What a thread's first message says about crediting the agent, when the person turned it off. */
export function creditNote(prefs: GitPrefs): string | null {
	return prefs.creditAgent
		? null
		: "When you commit, do not add a Co-authored-by line or any other trailer naming yourself.";
}
