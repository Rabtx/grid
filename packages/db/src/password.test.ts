import { describe, expect, it } from "bun:test";

import { hashPassword, verifyPassword } from "./password";

// A bcrypt hash made by the old API (bcryptjs, cost 4 to keep the test fast) of 100 × "x".
const LEGACY_LONG = "$2b$04$A9k6IXsFyPgbFZEcnUZafeIipKzurN.ty961en4dnn9TIXKzpCGOS";

describe("passwords", () => {
	it("verifies what it hashed, and nothing else", async () => {
		const hash = await hashPassword("correct-horse-battery", 4);
		expect(hash.startsWith("$2")).toBe(true);
		expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
		expect(await verifyPassword("wrong", hash)).toBe(false);
	});

	it("treats long passwords as bcrypt always did: the first 72 bytes count", async () => {
		const hash = await hashPassword("x".repeat(100), 4);
		expect(await verifyPassword("x".repeat(100), hash)).toBe(true);
		expect(await verifyPassword(`${"x".repeat(72)}different-tail`, hash)).toBe(true);
		expect(await verifyPassword("x".repeat(71), hash)).toBe(false);
	});

	it("says no to a malformed hash instead of throwing", async () => {
		expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
	});

	it("verifies hashes the old API made, long passwords included", async () => {
		expect(await verifyPassword("x".repeat(100), LEGACY_LONG)).toBe(true);
		expect(await verifyPassword("y".repeat(100), LEGACY_LONG)).toBe(false);
	});
});
