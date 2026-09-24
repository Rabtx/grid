/**
 * Thin wrapper over `fetch` for the Grid API.
 *
 * The API answers with an envelope (`{ success, statusCode, data }`) on the way out
 * and a different shape on failure, so every caller would otherwise unwrap the same
 * two branches. Unwrapping here means the services below deal in domain types only.
 *
 * This mirrors the client in `apps/web`. The duplication is deliberate and temporary:
 * the console is replacing that app, so the copy disappears when it does rather than
 * becoming a shared package that outlives the reason for it.
 */

interface ApiSuccess<T> {
	success: true;
	statusCode: number;
	data: T;
}

interface ApiFailure {
	success: false;
	statusCode: number;
	code?: string;
	message?: string;
	errors?: ReadonlyArray<{ path?: string; message?: string }>;
}

export class ApiError extends Error {
	constructor(
		message: string,
		readonly statusCode: number,
		readonly code?: string,
		readonly issues?: ApiFailure["errors"],
	) {
		super(message);
		this.name = "ApiError";
	}
}

const apiOrigin = resolveApiOrigin(import.meta.env.VITE_API_URL || defaultApiUrl());
const apiPrefix = "/api/v1";

export type ApiRequestOptions = RequestInit & { accessToken?: string };

let renewAccessToken: ((failedToken: string) => Promise<string | null>) | undefined;

/** Register the mounted auth provider; removal belongs to its lifecycle. */
export function registerTokenRenewal(renew: NonNullable<typeof renewAccessToken>): () => void {
	renewAccessToken = renew;
	return () => {
		if (renewAccessToken === renew) renewAccessToken = undefined;
	};
}

export const apiClient = {
	get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
		return request<T>(path, { ...options, method: "GET" });
	},
	post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
		return request<T>(path, {
			...options,
			method: "POST",
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	},
	patch<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
		return request<T>(path, { ...options, method: "PATCH", body: JSON.stringify(body) });
	},
	delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
		return request<T>(path, { ...options, method: "DELETE" });
	},
};

export function getApiOrigin(): string {
	return apiOrigin;
}

async function request<T>(path: string, options: ApiRequestOptions = {}, retry = true): Promise<T> {
	const { accessToken, ...init } = options;
	const headers = new Headers(init.headers);
	if (init.body) headers.set("Content-Type", "application/json");
	// The API rejects state-changing requests without this header as a CSRF guard.
	if (init.method && init.method !== "GET") headers.set("X-Requested-With", "XMLHttpRequest");
	if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

	const response = await fetch(`${apiOrigin}${apiPrefix}${normalizePath(path)}`, {
		...init,
		headers,
		// The refresh token lives in an http-only cookie, so credentials must ride along.
		credentials: "include",
	});
	if (response.status === 204) return undefined as T;

	const payload: unknown = await response.json().catch(() => ({}));
	if (!response.ok) {
		const failure = payload as ApiFailure;
		const error = new ApiError(
			typeof failure.message === "string"
				? failure.message
				: response.statusText || "Request failed",
			response.status,
			failure.code,
			failure.errors,
		);
		if (response.status === 401 && accessToken && retry && renewAccessToken) {
			const freshToken = await renewAccessToken(accessToken);
			if (freshToken) return request<T>(path, { ...options, accessToken: freshToken }, false);
		}
		throw error;
	}
	return isSuccess<T>(payload) ? payload.data : (payload as T);
}

/**
 * Without an explicit URL, call the API on this page's own origin: the console's dev and preview
 * servers forward `/api` to it (see vite.config.ts), so it works on localhost, a LAN IP or an
 * HTTPS tunnel alike.
 */
function defaultApiUrl(): string {
	if (typeof window === "undefined") return "http://localhost:4000";
	return window.location.origin;
}

function resolveApiOrigin(value: string): string {
	try {
		return new URL(value).origin;
	} catch {
		throw new Error(`Invalid VITE_API_URL: ${value}`);
	}
}

function normalizePath(path: string): string {
	return path.startsWith("/") ? path : `/${path}`;
}

function isSuccess<T>(payload: unknown): payload is ApiSuccess<T> {
	return (
		typeof payload === "object" &&
		payload !== null &&
		"success" in payload &&
		payload.success === true &&
		"data" in payload
	);
}
