import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import type { Probe } from "../ship/store";

/** Public targets only: the runner must never become a private-network HTTP proxy. */
export function publicAddress(address: string): boolean {
	if (isIP(address) === 4) {
		const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
		return !(
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
			(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
			(a === 203 && b === 0 && c === 113)
		);
	}
	if (isIP(address) !== 6) return false;
	const normalized = address.toLowerCase();
	return /^[23]/.test(normalized) && !/^(2001:(db8|0):|2001::|2002:)/.test(normalized);
}

export function monitorUrl(raw: string): URL {
	if (raw.length > 2_000) throw new Error("The address is too long");
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error("Give a public http or https address");
	}
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	)
		throw new Error("Use a public http or https address without credentials, query or fragment");
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (
		isIP(host)
			? !publicAddress(host)
			: !host.includes(".") || /(^|\.)(localhost|local|internal|home|test|invalid)$/.test(host)
	)
		throw new Error("Only public service addresses can be monitored");
	return url;
}

/** Resolve and pin the connection; redirects and bodies are never followed or retained. */
export async function probeService(raw: string): Promise<Probe> {
	const started = performance.now();
	let ok = false;
	const signal = AbortSignal.timeout(10_000);
	try {
		const url = monitorUrl(raw);
		const host = url.hostname.replace(/^\[|\]$/g, "");
		const addresses = await Promise.race([
			lookup(host, { all: true }),
			new Promise<never>((_resolve, reject) =>
				signal.addEventListener("abort", () => reject(new Error("Probe timed out")), {
					once: true,
				}),
			),
		]);
		if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
			throw new Error("Private target");
		const address = addresses[0]?.address;
		ok = await new Promise<boolean>((resolve) => {
			const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
				{
					hostname: address,
					port: url.port || (url.protocol === "https:" ? 443 : 80),
					path: url.pathname,
					method: "GET",
					headers: { Host: url.host },
					servername: host,
					agent: false,
					signal,
				},
				(response) => {
					resolve((response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300);
					response.destroy();
				},
			);
			request.on("error", () => resolve(false));
			request.end();
		});
	} catch {
		ok = false;
	}
	return { at: new Date().toISOString(), ok, ms: Math.round(performance.now() - started) };
}
