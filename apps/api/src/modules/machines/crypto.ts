import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Enrollment codes and machine secrets. A code is shown once and dies after fifteen minutes; the
 * secret a runner trades it for lives in the runner's own data and in Grid's database only as a
 * SHA-256 hash. Nothing can read a machine's secret back, not even the control plane.
 */

export function newEnrollmentCode(): string {
	return `gme_${randomBytes(24).toString("base64url")}`;
}

export function newMachineSecret(): string {
	return `gms_${randomBytes(32).toString("base64url")}`;
}

/** How a token is kept at rest. Tokens are high-entropy, so a single SHA-256 is enough. */
export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/** `Machine <id>.<secret>` from a runner's heartbeat. */
export function machineAuthorization(
	header: string | undefined,
): { id: string; secret: string } | null {
	if (!header?.startsWith("Machine ")) return null;
	const token = header.slice("Machine ".length).trim();
	const dot = token.indexOf(".");
	if (dot < 1 || dot === token.length - 1) return null;
	return { id: token.slice(0, dot), secret: token.slice(dot + 1) };
}

/** Whether a presented secret hashes to the stored one, compared without leaking where it differs. */
export function sameSecret(secret: string, storedHash: string): boolean {
	const given = Buffer.from(hashToken(secret), "hex");
	const kept = Buffer.from(storedHash, "hex");
	return given.length === kept.length && timingSafeEqual(given, kept);
}
