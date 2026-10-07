import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import {
	Alert,
	Badge,
	CopyIcon,
	EmptyState,
	IconButton,
	ListCard,
	RestoreIcon,
	Segmented,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Text,
	notify,
} from "@/kit";
import { useAuth } from "@/modules/auth";

import {
	diagnosticsService,
	type DiagnosticEntry,
	type DiagnosticFilter,
	type DiagnosticsResponse,
} from "../services/diagnostics.service";

import { SettingsPage } from "./settings-page";

const FILTERS = [
	{ value: "all", label: "All" },
	{ value: "error", label: "Errors" },
	{ value: "connection", label: "Connections" },
	{ value: "client", label: "Client" },
] as const;

export function DiagnosticsScreen(): JSX.Element {
	const auth = useAuth();
	const [filter, setFilter] = createSignal<DiagnosticFilter>("all");
	const [data, setData] = createSignal<DiagnosticsResponse | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [loading, setLoading] = createSignal(true);
	let requestId = 0;

	async function load(nextFilter = filter()): Promise<void> {
		const token = auth.token();
		if (!token) {
			setLoading(false);
			return;
		}
		const id = ++requestId;
		setLoading(true);
		try {
			const next = await diagnosticsService(token, nextFilter);
			// An answer for a filter since replaced must not overwrite the newer one.
			if (id !== requestId) return;
			setData(next);
			setError(null);
		} catch (cause) {
			if (id === requestId) {
				setError(cause instanceof Error ? cause.message : "Could not load runner diagnostics");
			}
		} finally {
			if (id === requestId) setLoading(false);
		}
	}

	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void untrack(() => load());
		},
	);

	async function copy(): Promise<void> {
		const current = data();
		if (!current) return;
		const content = [
			`Grid runner diagnostics · ${current.reconnects24h} reconnects in the last 24 hours`,
			...current.events.map(formatEvent),
		].join("\n");
		try {
			await navigator.clipboard.writeText(content);
			notify({ title: "Diagnostics copied", tone: "success" });
		} catch {
			notify({ title: "Could not copy diagnostics", tone: "danger" });
		}
	}

	return (
		<SettingsPage
			title="Diagnostics"
			description="Runner errors and socket events from the last seven days."
			actions={
				<>
					<IconButton size="sm" label="Copy as text" disabled={!data()} onClick={() => void copy()}>
						<CopyIcon />
					</IconButton>
					<IconButton size="sm" label="Refresh" onClick={() => void load()} disabled={loading()}>
						<RestoreIcon />
					</IconButton>
				</>
			}
		>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<Show when={data()}>
				{(loaded) => (
					<SettingsGroup title="Connection summary">
						<SettingsRow
							label="Reconnects in the last 24 hours"
							description="Console reconnect attempts received by this runner."
						>
							<Badge tone={loaded().reconnects24h ? "warning" : "neutral"}>
								{loaded().reconnects24h}
							</Badge>
						</SettingsRow>
					</SettingsGroup>
				)}
			</Show>

			<SettingsGroup
				title="Recent events"
				description="Times are recorded by the runner when it receives each event."
			>
				<Segmented
					label="Filter diagnostics"
					block
					options={FILTERS}
					value={filter()}
					onChange={(value) => {
						setFilter(value);
						void load(value);
					}}
				/>
				<Show when={!loading()} fallback={<Skeleton class="h-24" />}>
					<Show
						when={(data()?.events.length ?? 0) > 0}
						fallback={
							<EmptyState
								title="No diagnostic events"
								description="Runner errors and connection changes will appear here."
							/>
						}
					>
						<ListCard>
							<For each={data()?.events ?? []}>{(event) => <DiagnosticRow event={event} />}</For>
						</ListCard>
					</Show>
				</Show>
			</SettingsGroup>
		</SettingsPage>
	);
}

function DiagnosticRow(props: { event: DiagnosticEntry }): JSX.Element {
	return (
		<article class="flex min-w-0 flex-col gap-1.5 px-4 py-3.5">
			<div class="flex min-w-0 flex-wrap items-center gap-2">
				<Text as="h3" tone="strong" weight="medium" class="min-w-0 flex-1 break-words">
					{props.event.message}
				</Text>
				<Badge tone={props.event.kind === "error" ? "danger" : "neutral"}>{props.event.kind}</Badge>
			</div>
			<Text size="caption" tone="subtle" class="break-words">
				{new Date(props.event.at).toLocaleString()} · {props.event.source}
			</Text>
			<Text size="caption" tone="subtle" mono class="break-words">
				{JSON.stringify(props.event.details)}
			</Text>
		</article>
	);
}

function formatEvent(event: DiagnosticEntry): string {
	return `${new Date(event.at).toISOString()} [${event.kind}/${event.source}] ${event.message} ${JSON.stringify(event.details)}`;
}
