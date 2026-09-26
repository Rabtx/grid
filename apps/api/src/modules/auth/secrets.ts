/**
 * Secrets stored encrypted (2FA seeds): AES-256-GCM with a key derived from AUTH_TOKEN_SECRET,
 * stored as `iv.tag.ciphertext` in base64url, the format the old API wrote. WebCrypto.
 */
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));

async function key(authTokenSecret: string): Promise<CryptoKey> {
	const raw = new Uint8Array(new Bun.CryptoHasher("sha256").update(authTokenSecret).digest());
	return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(authTokenSecret: string, value: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const sealed = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			await key(authTokenSecret),
			new TextEncoder().encode(value),
		),
	);
	// WebCrypto appends the 16-byte tag; the stored format keeps it separate.
	return [iv, sealed.slice(-16), sealed.slice(0, -16)].map(b64).join(".");
}

export async function decryptSecret(authTokenSecret: string, value: string): Promise<string> {
	const [iv, tag, data, ...rest] = value.split(".");
	if (!iv || !tag || !data || rest.length > 0) {
		throw new Error("Encrypted secret has an invalid format");
	}
	const sealed = new Uint8Array([...unb64(data), ...unb64(tag)]);
	const plain = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: unb64(iv) },
		await key(authTokenSecret),
		sealed,
	);
	return new TextDecoder().decode(plain);
}

/** A recovery code people write down: `xxxxxxxx-xxxxxxxx`, hex. */
export function generateRecoveryCode(): string {
	const hex = (n: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("hex");
	return `${hex(4)}-${hex(4)}`;
}

export function hashRecoveryCode(authTokenSecret: string, code: string): string {
	return new Bun.CryptoHasher("sha256", authTokenSecret)
		.update(`recovery:${code.trim().toLowerCase()}`)
		.digest("hex");
}
