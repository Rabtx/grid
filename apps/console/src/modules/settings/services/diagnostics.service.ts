import { runnerCall } from "@/lib/runner-client";

export type DiagnosticKind = "error" | "connection" | "client";
export type DiagnosticFilter = DiagnosticKind | "all";

export type DiagnosticEntry = {
	id: number;
	at: number;
	workspace: string | null;
	kind: DiagnosticKind;
	source: string;
	message: string;
	details: Record<string, unknown>;
};

export type DiagnosticsResponse = {
	events: DiagnosticEntry[];
	reconnects24h: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function diagnosticsService(
	token: string,
	filter: DiagnosticFilter,
): Promise<DiagnosticsResponse> {
	const query = new URLSearchParams({ since: String(Date.now() - WEEK_MS) });
	if (filter !== "all") query.set("kind", filter);
	return runnerCall<DiagnosticsResponse>(`/diagnostics?${query}`, token);
}
