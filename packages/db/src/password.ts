/**
 * Password hashes as Grid stores them: bcrypt, cost 12, through `Bun.password`.
 *
 * Bcrypt only ever reads a password's first 72 bytes. The old API (bcryptjs) cut longer
 * passwords there; `Bun.password` instead pre-hashes them with SHA-512, which would make every
 * existing long-password hash fail to verify (and new ones fail under bcryptjs). Cutting to 72
 * bytes here keeps both working, with the same strength bcrypt always had.
 */
const BCRYPT_MAX_BYTES = 72;

function bcryptInput(password: string): string {
	const bytes = new TextEncoder().encode(password);
	if (bytes.length <= BCRYPT_MAX_BYTES) return password;
	// A cut inside a multi-byte character decodes to U+FFFD, as bcryptjs's byte cut did in effect.
	return new TextDecoder().decode(bytes.slice(0, BCRYPT_MAX_BYTES));
}

export function hashPassword(password: string, cost = 12): Promise<string> {
	return Bun.password.hash(bcryptInput(password), { algorithm: "bcrypt", cost });
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
	return Bun.password.verify(bcryptInput(password), hash).catch(() => false);
}
