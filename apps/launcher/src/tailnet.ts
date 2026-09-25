/** This machine on its tailnet, as `tailscale status` reports it. */
export type TailnetSelf = { ip: string; dnsName: string };

/** This machine's tailnet address and name, or null when Tailscale is not installed or not up. */
export async function tailnetSelf(): Promise<TailnetSelf | null> {
	try {
		const child = Bun.spawn(["tailscale", "status", "--json"], {
			stdout: "pipe",
			stderr: "ignore",
		});
		const [text, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
		if (code !== 0) return null;
		const status = JSON.parse(text) as {
			BackendState?: string;
			Self?: { TailscaleIPs?: string[]; DNSName?: string };
		};
		const ip = status.Self?.TailscaleIPs?.find((address) => !address.includes(":"));
		const dnsName = status.Self?.DNSName?.replace(/\.$/, "");
		return status.BackendState === "Running" && ip && dnsName ? { ip, dnsName } : null;
	} catch {
		return null;
	}
}

/** Tailscale comes up alongside the container; give it a little while before giving up. */
export async function waitForTailnet(timeoutMs = 30_000): Promise<TailnetSelf | null> {
	const until = Date.now() + timeoutMs;
	for (;;) {
		const self = await tailnetSelf();
		if (self || Date.now() >= until) return self;
		await Bun.sleep(1_000);
	}
}
