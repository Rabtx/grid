import type { Context } from "hono";

import type { AppEnv } from "./context";

/** Reason phrases in the form NestJS put in `code` when an error named none. */
const STATUS_CODES: Record<number, string> = {
	400: "BAD_REQUEST",
	401: "UNAUTHORIZED",
	402: "PAYMENT_REQUIRED",
	403: "FORBIDDEN",
	404: "NOT_FOUND",
	405: "METHOD_NOT_ALLOWED",
	409: "CONFLICT",
	410: "GONE",
	413: "PAYLOAD_TOO_LARGE",
	415: "UNSUPPORTED_MEDIA_TYPE",
	422: "UNPROCESSABLE_ENTITY",
	423: "LOCKED",
	429: "TOO_MANY_REQUESTS",
	500: "INTERNAL_SERVER_ERROR",
	501: "NOT_IMPLEMENTED",
	502: "BAD_GATEWAY",
	503: "SERVICE_UNAVAILABLE",
};

/** NestJS's default messages for exceptions thrown without one ("Not Found", "Conflict"…). */
const STATUS_MESSAGES: Record<number, string> = {
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	409: "Conflict",
	422: "Unprocessable Entity",
	423: "Locked",
	429: "Too Many Requests",
	500: "Internal Server Error",
	503: "Service Unavailable",
};

export function statusCodeName(status: number): string {
	return STATUS_CODES[status] ?? "ERROR";
}

/**
 * An error the API answers with on purpose: its status, a machine code and a human message,
 * with field errors for validation. Anything else thrown is a 500 that reveals nothing.
 */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message?: string,
		readonly code: string = statusCodeName(status),
		readonly errors?: ReadonlyArray<unknown>,
	) {
		super(message ?? STATUS_MESSAGES[status] ?? statusCodeName(status));
		this.name = "ApiError";
	}
}

type ErrorInit = { code?: string; message?: string; errors?: ReadonlyArray<unknown> };

function make(status: number) {
	return (init?: string | ErrorInit): ApiError =>
		typeof init === "string" || init === undefined
			? new ApiError(status, init)
			: new ApiError(status, init.message, init.code, init.errors);
}

export const badRequest = make(400);
export const unauthorized = make(401);
export const forbidden = make(403);
export const notFound = make(404);
export const conflict = make(409);
export const locked = make(423);
export const tooManyRequests = make(429);
export const serviceUnavailable = make(503);

/** The error body, in the shape the console and native apps already read. */
export function errorResponse(c: Context<AppEnv>, error: unknown): Response {
	const known = error instanceof ApiError;
	if (!known) console.error(error);
	const status = known ? error.status : 500;
	const url = new URL(c.req.url);
	return c.json(
		{
			success: false,
			statusCode: status,
			code: known ? error.code : "INTERNAL_SERVER_ERROR",
			message: known ? error.message : "Internal server error",
			requestId: c.get("requestId") ?? "req_unknown",
			timestamp: new Date().toISOString(),
			path: url.pathname + url.search,
			method: c.req.method,
			...(known && error.errors ? { errors: error.errors } : {}),
		},
		status as 500,
	);
}
