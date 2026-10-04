import { useNavigate, useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	AgentLogo,
	Alert,
	Avatar,
	Button,
	ChipRow,
	ConfirmDialog,
	ConnectorHeader,
	FolderIcon,
	notify,
	Select,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Spinner,
	Stack,
	Switch,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { SettingsPage, settingsMenu } from "@/modules/settings/components/settings-page";
import { useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { mayDo } from "@/modules/workspaces/lib/members";

import { ConnectorGlyph, Health } from "../lib/connectors";
import { connectorsService } from "../services/connectors.service";
import type {
	ActivityEntry,
	AgentAccess,
	Connection,
	ConnectionDetail,
	Rule,
} from "../types/connector.types";
import { RuleRow } from "./rule-row";

const ACCESS: { value: AgentAccess; label: string }[] = [
	{ value: "rules", label: "Follows the rules above" },
	{ value: "read", label: "Read only" },
	{ value: "off", label: "No access" },
];

const OUTCOME: Record<ActivityEntry["outcome"], string> = {
	done: "",
	blocked: " · blocked",
	denied: " · you said no",
	failed: " · failed",
};

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** What it is and how it signs in, under its name. */
function metaLine(connection: Connection): string {
	const how =
		connection.kind === "custom"
			? connection.transport === "stdio"
				? (connection.command ?? "")
				: (connection.url ?? "")
			: connection.auth === "gh"
				? "GitHub CLI sign-in"
				: connection.auth === "oauth"
					? "Signed in"
					: "API key";
	return [
		how,
		`${connection.tools.length} tools`,
		connection.checkedAt ? `checked ${relativeTime(connection.checkedAt)}` : null,
	]
		.filter(Boolean)
		.join(" · ");
}

/**
 * One connector (Figma 24 · Connector · GitHub): how it is doing, what it powers, what agents may
 * do with it — for every agent, then per agent — GitHub's repositories agents may work in, and
 * what agents did with it lately.
 */
export function ConnectorScreen(): JSX.Element {
	const params = useParams<{ id: string }>();
	const auth = useAuth();
	const shell = useShell();
	const navigate = useNavigate();
	const workspaces = useWorkspaces();
	const [detail, setDetail] = createSignal<ConnectionDetail | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	const [leaving, setLeaving] = createSignal(false);

	const manager = () => {
		const current = workspaces.current();
		return current
			? mayDo("integrations", current.role, current.customRole, current.settings)
			: false;
	};

	async function load(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			setDetail(await connectorsService.get(token, params.id));
			setError(null);
		} catch (cause) {
			setError(reason(cause, "Could not load this connector"));
		}
	}
	createEffect(
		() => [auth.token(), params.id] as const,
		([token]) => {
			if (!token) return;
			void load();
			// The agents for "Per agent", when no other screen has asked for them yet.
			void providersStore.load(token);
		},
	);

	async function change(
		patch: Parameters<typeof connectorsService.update>[2],
		failure = "Not changed",
	): Promise<void> {
		const token = auth.token(),
			current = detail();
		if (!token || !current) return;
		try {
			const connection = await connectorsService.update(token, current.connection.id, patch);
			setDetail({ ...current, connection });
		} catch (cause) {
			notify({ title: failure, description: reason(cause, "Try again") });
		}
	}

	async function check(): Promise<void> {
		const token = auth.token(),
			current = detail();
		if (!token || !current || busy()) return;
		setBusy(true);
		try {
			const connection = await connectorsService.check(token, current.connection.id);
			setDetail({ ...current, connection });
			notify({
				title:
					connection.status === "healthy"
						? `${connection.name} answered · ${connection.tools.length} tools`
						: (connection.statusDetail ?? "It did not answer"),
			});
		} catch (cause) {
			notify({ title: "Not checked", description: reason(cause, "Try again") });
		} finally {
			setBusy(false);
		}
	}

	async function disconnect(): Promise<void> {
		const token = auth.token(),
			current = detail();
		if (!token || !current) return;
		try {
			await connectorsService.remove(token, current.connection.id);
			notify({ title: `${current.connection.name} disconnected` });
			navigate("/settings/connectors");
		} catch (cause) {
			notify({ title: "Not disconnected", description: reason(cause, "Try again") });
		}
		setLeaving(false);
	}

	const connection = () => detail()?.connection;
	const agents = () => offeredProviders(providersStore.providers());
	const unsupported = (id: string) => detail()?.agentsWithoutConnectors.includes(id) ?? false;
	const ruleOf = (id: string): Rule =>
		connection()?.rules[id] ??
		connection()?.capabilities.find((item) => item.id === id)?.initial ??
		"ask";
	const agentName = (id: string) => agents().find((item) => item.id === id)?.name ?? id;

	return (
		<SettingsPage
			title={connection()?.name ?? "Connector"}
			parent={{ label: "Connectors", href: "/settings/connectors" }}
			subtitle={
				connection()
					? `${connection()?.status === "healthy" ? "Healthy" : "Needs attention"} · ${connection()?.tools.length ?? 0} tools`
					: undefined
			}
			description={
				connection()
					? connection()?.kind === "custom"
						? "Your own MCP server, run on this machine behind Grid's rules."
						: `Connected through the official ${connection()?.name} MCP server.`
					: undefined
			}
			menu={
				manager()
					? settingsMenu(
							connection()?.name ?? "Connector",
							[
								{
									items: [
										{ id: "test", label: "Test" },
										{ id: "disconnect", label: "Disconnect", danger: true },
									],
								},
							],
							(id) => (id === "test" ? void check() : setLeaving(true)),
						)
					: undefined
			}
		>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<Show
				when={connection()}
				fallback={
					<Show when={!error()}>
						<Stack gap={3}>
							<Skeleton class="h-20" />
							<Skeleton class="h-48" />
						</Stack>
					</Show>
				}
			>
				{(current) => (
					<>
						<Stack gap={3}>
							<ConnectorHeader
								glyph={<ConnectorGlyph kind={current().kind} />}
								name={current().name}
								health={<Health connection={current()} />}
								meta={metaLine(current())}
								actions={
									<Show when={manager()}>
										<Button size="sm" disabled={busy()} onClick={() => void check()}>
											<Show when={busy()} fallback="Test">
												<Spinner /> Testing…
											</Show>
										</Button>
										<Button size="sm" variant="ghost" onClick={() => setLeaving(true)}>
											Disconnect
										</Button>
									</Show>
								}
							/>
							<Show when={current().statusDetail}>
								{(message) => <Alert tone="danger" title={message()} />}
							</Show>
							<Show when={current().powers.length > 0}>
								<ChipRow label="Powers" items={current().powers} />
							</Show>
						</Stack>

						<SettingsGroup
							title="What agents can do"
							description="Applies to every agent unless you change it below"
						>
							<For each={current().capabilities}>
								{(capability) => (
									<RuleRow
										capability={capability}
										value={ruleOf(capability.id)}
										disabled={!manager()}
										onChange={(rule) => void change({ rules: { [capability.id]: rule } })}
									/>
								)}
							</For>
						</SettingsGroup>

						<Show when={agents().length > 0}>
							<SettingsGroup title="Per agent">
								<For each={agents()}>
									{(agent) => (
										<SettingsRow
											inline
											mark={<AgentLogo id={agent.id} name={agent.name} />}
											label={agent.name}
										>
											<Show
												when={!unsupported(agent.id)}
												fallback={
													<Text size="caption" tone="subtle">
														Can't use connectors yet
													</Text>
												}
											>
												<Select<AgentAccess>
													look={shell.desktop() ? "pill" : "value"}
													label={`What ${agent.name} may do with ${current().name}`}
													value={current().agents[agent.id] ?? "rules"}
													onChange={(access) => {
														if (manager()) void change({ agents: { [agent.id]: access } });
													}}
													groups={[{ options: ACCESS }]}
												/>
											</Show>
										</SettingsRow>
									)}
								</For>
							</SettingsGroup>
						</Show>

						<Show when={detail()?.repositories}>
							{(repositories) => (
								<SettingsGroup title="Repositories agents can work in">
									<Show
										when={repositories().length > 0}
										fallback={
											<SettingsRow
												label="No projects on GitHub yet"
												description="Projects whose folder has a GitHub remote show here."
											/>
										}
									>
										<For each={repositories()}>
											{(repository) => (
												<SettingsRow
													inline
													mark={<FolderIcon />}
													label={repository.project}
													description={
														repository.shared
															? `${repository.repository} · ${repository.defaultBranch}`
															: "Not shared with agents"
													}
												>
													<Switch
														label={`Agents may work in ${repository.repository}`}
														checked={repository.shared}
														disabled={!manager()}
														onChange={(shared) => {
															const hidden = new Set(current().hiddenRepositories);
															if (shared) hidden.delete(repository.repository);
															else hidden.add(repository.repository);
															void change({ hiddenRepositories: [...hidden] }).then(load);
														}}
													/>
												</SettingsRow>
											)}
										</For>
									</Show>
								</SettingsGroup>
							)}
						</Show>

						<SettingsGroup title="Recent activity">
							<Show
								when={(detail()?.activity.length ?? 0) > 0}
								fallback={
									<SettingsRow
										label="Nothing yet"
										description="What agents do with it shows here, blocked calls too."
									/>
								}
							>
								<For each={detail()?.activity ?? []}>
									{(entry) => (
										<SettingsRow
											inline
											mark={
												agents().some((agent) => agent.id === entry.agent) ? (
													<AgentLogo id={entry.agent} name={agentName(entry.agent)} />
												) : (
													<Avatar name={agentName(entry.agent)} size="md" />
												)
											}
											label={`${entry.tool.replaceAll("_", " ")}${OUTCOME[entry.outcome]}`}
											description={agentName(entry.agent)}
										>
											<Text size="caption" tone="subtle">
												{relativeTime(entry.at)}
											</Text>
										</SettingsRow>
									)}
								</For>
							</Show>
						</SettingsGroup>
					</>
				)}
			</Show>

			<ConfirmDialog
				open={leaving()}
				onClose={() => setLeaving(false)}
				onConfirm={() => void disconnect()}
				title={`Disconnect ${connection()?.name ?? "this connector"}?`}
				description="Agents lose it from their next run, and its sign-in is deleted from this machine."
				confirm="Disconnect"
				danger
			/>
		</SettingsPage>
	);
}
