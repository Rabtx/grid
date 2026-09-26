import { networkInterfaces } from "node:os";

/**
 * IPv4 addresses this machine currently holds on non-internal interfaces (Wi-Fi, Ethernet,
 * Tailscale…). Read on every call so a DHCP lease change is picked up without a restart.
 */
export function localNetworkAddresses(): Set<string> {
	const addresses = new Set<string>();
	for (const entries of Object.values(networkInterfaces())) {
		for (const entry of entries ?? []) {
			if (entry.family === "IPv4" && !entry.internal) addresses.add(entry.address);
		}
	}
	return addresses;
}

/**
 * True when `origin` is one of `allowedOrigins` re-hosted on a current local network address,
 * e.g. `http://localhost:3001` allowed ⇒ `http://192.168.1.20:3001` allowed. Lets another device
 * on the LAN use the dev servers without hard-coding this machine's IP.
 */
export function isLocalNetworkVariant(origin: string, allowedOrigins: string[]): boolean {
	let candidate: URL;
	try {
		candidate = new URL(origin);
	} catch {
		return false;
	}
	if (!localNetworkAddresses().has(candidate.hostname)) return false;

	return allowedOrigins.some((allowed) => {
		try {
			const url = new URL(allowed);
			return url.protocol === candidate.protocol && url.port === candidate.port;
		} catch {
			return false;
		}
	});
}
