import { apiClient } from "@/lib/api-client";

import type { AuthSession, LoginInput, LoginResult } from "../types/auth.types";

export const authService = {
	login: (input: LoginInput) => apiClient.post<LoginResult>("/auth/login", input),
	/** Trades the http-only refresh cookie for a fresh access token. */
	refresh: () => apiClient.post<AuthSession>("/auth/refresh"),
	logout: () => apiClient.post<void>("/auth/logout"),
};
