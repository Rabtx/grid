import type { ZodType } from "zod";

import { badRequest } from "./errors";

export type ValidationErrorItem = { code: string; path: string; message: string };

/** Check a value against a schema, failing as NestJS's validation pipe did (400, field errors). */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
	const result = schema.safeParse(value);
	if (result.success) return result.data;
	throw badRequest({
		code: "VALIDATION_ERROR",
		message: "Request validation failed",
		errors: result.error.issues.map((issue): ValidationErrorItem => ({
			code: issue.code,
			path: issue.path.join("."),
			message: issue.message,
		})),
	});
}

/**
 * The JSON body, validated, read as Express did: a body that is not JSON by its content type, or
 * is empty, counts as `{}`; malformed JSON is a 400 with the parser's message.
 */
export async function body<T>(
	request: { header: (name: string) => string | undefined; text: () => Promise<string> },
	schema: ZodType<T>,
): Promise<T> {
	return parse(schema, await readJson(request));
}

export async function readJson(request: {
	header: (name: string) => string | undefined;
	text: () => Promise<string>;
}): Promise<unknown> {
	if (!request.header("content-type")?.toLowerCase().includes("json")) return {};
	const text = await request.text();
	if (!text.trim()) return {};
	try {
		return JSON.parse(text);
	} catch (error) {
		throw badRequest(error instanceof Error ? error.message : "Invalid JSON");
	}
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A route parameter that must be a v4 UUID, refused in NestJS's words. */
export function uuidV4(value: string): string {
	if (!UUID_V4.test(value)) throw badRequest("Validation failed (uuid v 4 is expected)");
	return value;
}
