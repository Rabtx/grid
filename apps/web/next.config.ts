import { networkInterfaces } from "node:os";
import path from "node:path";
import type { NextConfig } from "next";

/** This machine's current LAN addresses, so the dev server accepts pages opened by IP. */
function localNetworkAddresses(): string[] {
	return Object.values(networkInterfaces()).flatMap((entries) =>
		(entries ?? [])
			.filter((entry) => entry.family === "IPv4" && !entry.internal)
			.map((entry) => entry.address),
	);
}

const nextConfig: NextConfig = {
	output: "standalone",
	outputFileTracingRoot: path.join(__dirname, "../.."),
	transpilePackages: ["@grid/ui"],
	allowedDevOrigins: ["127.0.0.1", ...localNetworkAddresses()],
};

export default nextConfig;
