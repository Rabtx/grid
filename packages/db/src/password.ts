/**
 * Password hashes as Grid stores them: bcrypt, cost 12, through `Bun.password`. Bcrypt keeps
 * every existing hash valid, and `Bun.password.verify` checks them.
 */
export function hashPassword(password: string, cost = 12): Promise<string> {
	return Bun.password.hash(password, { algorithm: "bcrypt", cost });
}
