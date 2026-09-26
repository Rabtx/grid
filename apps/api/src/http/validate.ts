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

/** The JSON body, validated. A missing or malformed body validates as `{}`. */
export async function body<T>(
	request: Request | { json: () => Promise<unknown> },
	schema: ZodType<T>,
): Promise<T> {
	const value = await request.json().catch(() => ({}));
	return parse(schema, value);
}
