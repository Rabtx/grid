/**
 * Time-based one-time codes (RFC 6238: HMAC-SHA1, 6 digits, 30-second steps) on Bun's own
 * hasher, compatible with the secrets and codes the old API made with otplib.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;
/** Codes made up to this many seconds before or after now are accepted, as before. */
const TOLERANCE = 30;

export function base32Encode(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
	return out;
}

export function base32Decode(text: string): Uint8Array {
	const clean = text.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
	const out: number[] = [];
	let bits = 0;
	let value = 0;
	for (const char of clean) {
		const index = ALPHABET.indexOf(char);
		if (index < 0) throw new Error("Invalid base32 secret");
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return new Uint8Array(out);
}

/** A new shared secret: 20 random bytes, 32 base32 characters. */
export function generateTotpSecret(): string {
	return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function totpUri(options: { issuer: string; label: string; secret: string }): string {
	return `otpauth://totp/${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.label)}?secret=${options.secret}&issuer=${encodeURIComponent(options.issuer)}`;
}

/** The code for one time step. */
export function totpAt(secret: string, step: number): string {
	const counter = new Uint8Array(8);
	new DataView(counter.buffer).setBigUint64(0, BigInt(step));
	const mac = new Bun.CryptoHasher("sha1", base32Decode(secret)).update(counter).digest();
	const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
	const binary =
		(((mac[offset] ?? 0) & 0x7f) << 24) |
		((mac[offset + 1] ?? 0) << 16) |
		((mac[offset + 2] ?? 0) << 8) |
		(mac[offset + 3] ?? 0);
	return String(binary % 1_000_000).padStart(6, "0");
}

export function totpCode(secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
	return totpAt(secret, Math.floor(nowSeconds / STEP));
}

/** True when `code` belongs to any step within the tolerance around now. */
export function verifyTotp(
	secret: string,
	code: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
	if (!/^\d{6}$/.test(code)) return false;
	const first = Math.floor((nowSeconds - TOLERANCE) / STEP);
	const last = Math.floor((nowSeconds + TOLERANCE) / STEP);
	let match = false;
	for (let step = first; step <= last; step++) {
		// Every candidate is checked, so timing does not reveal which step matched.
		if (totpAt(secret, step) === code) match = true;
	}
	return match;
}
