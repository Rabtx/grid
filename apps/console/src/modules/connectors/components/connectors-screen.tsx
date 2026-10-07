import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import {
	Alert,
	Button,
	ConnectorCard,
	ConnectorGrid,
	LinkButton,
	notify,
	PlusIcon,
	Row,
	SearchIcon,
	SearchInput,
	Segmented,
	SettingsGroup,
	SettingsLinkRow,
	SettingsRow,
	Skeleton,
	Spacer,
	Stack,
	Switch,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { SettingsPage, settingsMenu } from "@/modules/settings/components/settings-page";
import { useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { mayDo } from "@/modules/workspaces/lib/members";

import {
	CATEGORIES,
	type CategoryFilter,
	ConnectorGlyph,
	Health,
	healthOf,
	needsSignIn,
	rulesSummary,
	serviceOf,
} from "../lib/connectors";
import { connectorsService } from "../services/connectors.service";
import type { CatalogService, Connection, ConnectorsView } from "../types/connector.types";
import { ConnectDialog } from "./connect-dialog";
import { McpServerDialog } from "./mcp-server-dialog";

// Suggestions shown before "Show all".
const SUGGESTED = 5;

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** A custom server's line: where it runs and what it offers. */
function serverLine(connection: Connection, machine: string): string {
	const where = connection.transport === "stdio" ? `on ${machine}` : (connection.url ?? "");
	return [rulesSummary(connection), where, `${connection.tools.length} tools`]
		.filter(Boolean)
		.join(" · ");
}

/**
 * Settings → Connectors (Figma 24): the tools the workspace already uses, plugged in through their
 * official MCP servers so agents work with them under the workspace's rules. What is connected,
 * what its projects suggest, and the workspace's own MCP servers. Phones list each as a row.
 */
export function ConnectorsScreen(): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const navigate = useNavigate();
	const location = useLocation();
	const workspaces = useWorkspaces();
	const [view, setView] = createSignal<ConnectorsView | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [query, setQuery] = createSignal("");
	const [category, setCategory] = createSignal<CategoryFilter>("all");
	const [connecting, setConnecting] = createSignal<CatalogService | null>(null);
	// A sign-in finished in its own window that came back here to continue (see OAuthCallback).
	const [resume, setResume] = createSignal<string | null>(null);
	const asked = new URLSearchParams(window.location.search);
	let pendingResume =
		asked.get("resume") && asked.get("service")
			? { state: asked.get("resume") ?? "", service: asked.get("service") ?? "" }
			: null;
	createEffect(
		() => view(),
		(current) => {
			if (!current || !pendingResume) return;
			const service = current.catalog.find((item) => item.id === pendingResume?.service);
			const state = pendingResume.state;
			pendingResume = null;
			// The router's own path (it already carries the workspace), without the query.
			navigate(
				untrack(() => location.pathname),
				{ replace: true },
			);
			if (!service) return;
			setResume(state);
			setConnecting(service);
		},
	);
	const [adding, setAdding] = createSignal(false);
	const [allSuggestions, setAllSuggestions] = createSignal(false);

	const name = () => workspaces.current()?.name ?? "your workspace";
	// Changing connectors is for roles that manage integrations (Settings → Roles).
	const manager = () => {
		const current = workspaces.current();
		return current
			? mayDo("integrations", current.role, current.customRole, current.settings)
			: false;
	};

	async function load(): Promise<void> {
		const token = untrack(auth.token);
		if (!token) return;
		try {
			setView(await connectorsService.view(token));
			setError(null);
		} catch (cause) {
			setError(reason(cause, "Could not reach this machine's runner"));
		}
	}
	createEffect(
		() => [auth.token(), workspaces.current()?.slug] as const,
		([token]) => {
			if (token) void load();
		},
	);

	const matches = (text: string) => text.toLowerCase().includes(query().trim().toLowerCase());
	const inCategory = (service: CatalogService | undefined) =>
		category() === "all" || service?.category === category();
	const catalog = () => view()?.catalog ?? [];
	const connected = () =>
		(view()?.connections ?? []).filter((item) => {
			const service = serviceOf(catalog(), item);
			return item.kind !== "custom" && inCategory(service) && matches(item.name);
		});
	const custom = () =>
		(view()?.connections ?? []).filter((item) => item.kind === "custom" && matches(item.name));
	const suggested = () =>
		(view()?.suggested ?? [])
			.map((id) => catalog().find((service) => service.id === id))
			.filter(
				(service): service is CatalogService =>
					Boolean(service) && inCategory(service) && matches(service?.name ?? ""),
			);
	// What the projects use comes first; a search or a category shows everything that fits.
	const shownSuggestions = () =>
		allSuggestions() || query().trim() || category() !== "all"
			? suggested()
			: suggested().slice(0, SUGGESTED);
	const machine = () => "this machine";

	async function toggle(connection: Connection, enabled: boolean): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			await connectorsService.update(token, connection.id, { enabled });
			await load();
		} catch (cause) {
			notify({ title: "Not changed", description: reason(cause, "Try again") });
		}
	}

	const connect = (service: CatalogService) => (
		<Show when={manager()}>
			<Button size="sm" onClick={() => setConnecting(service)}>
				Connect
			</Button>
		</Show>
	);

	return (
		<SettingsPage
			title="Connectors"
			description={`Plug in the tools ${name()} already uses. Grid brings them into one place, and agents only get the access you allow.`}
			subtitle={view() ? `${view()?.connections.length ?? 0} connected` : undefined}
			menu={
				manager()
					? settingsMenu(
							"Connectors",
							[{ items: [{ id: "mcp", label: "Add MCP server", icon: <PlusIcon /> }] }],
							() => setAdding(true),
						)
					: undefined
			}
		>
			<Row gap={3} wrap>
				<div class="w-full md:w-55">
					<SearchInput
						icon={<SearchIcon size="sm" />}
						aria-label="Search connectors"
						placeholder="Search connectors"
						value={query()}
						onInput={(event) => setQuery(event.currentTarget.value)}
					/>
				</div>
				<Show when={shell.desktop()}>
					<Segmented<CategoryFilter>
						label="Show"
						size="sm"
						value={category()}
						onChange={setCategory}
						options={CATEGORIES}
					/>
					<Spacer />
					<Show when={manager()}>
						<Button size="sm" onClick={() => setAdding(true)}>
							Add MCP server
						</Button>
					</Show>
				</Show>
			</Row>

			<Show when={error()}>
				{(message) => (
					<Alert
						tone="danger"
						title={message()}
						action={
							<Button size="sm" onClick={() => void load()}>
								Try again
							</Button>
						}
					/>
				)}
			</Show>

			<Show
				when={view()}
				fallback={
					<Show when={!error()}>
						<Stack gap={3}>
							<Skeleton class="h-36" />
							<Skeleton class="h-36" />
						</Stack>
					</Show>
				}
			>
				<Show when={connected().length > 0}>
					<Show
						when={shell.desktop()}
						fallback={
							<SettingsGroup title="Connected">
								<For each={connected()}>
									{(connection) => (
										<SettingsLinkRow
											mark={<ConnectorGlyph kind={connection.kind} />}
											label={connection.name}
											description={`${healthOf(connection).label} · ${rulesSummary(connection)}`}
											onClick={() => navigate(`/settings/connectors/${connection.id}`)}
										/>
									)}
								</For>
							</SettingsGroup>
						}
					>
						<SettingsGroup
							plain
							title="Connected"
							description={`${connected().length} tool${connected().length === 1 ? "" : "s"} · all through their official MCP servers`}
						>
							<ConnectorGrid>
								<For each={connected()}>
									{(connection) => (
										<ConnectorCard
											glyph={<ConnectorGlyph kind={connection.kind} />}
											name={connection.name}
											kind={serviceOf(catalog(), connection)?.kind ?? "MCP"}
											health={<Health connection={connection} />}
											blurb={serviceOf(catalog(), connection)?.blurb ?? ""}
											summary={rulesSummary(connection)}
											href={workspaceHref(`/settings/connectors/${connection.id}`)}
											action={
												needsSignIn(connection) && manager() ? (
													<Button
														size="sm"
														onClick={() => {
															const service = serviceOf(catalog(), connection);
															if (service) setConnecting(service);
														}}
													>
														Reconnect
													</Button>
												) : undefined
											}
										/>
									)}
								</For>
							</ConnectorGrid>
						</SettingsGroup>
					</Show>
				</Show>

				<Show when={suggested().length > 0}>
					<SettingsGroup
						title={shell.desktop() ? `Suggested for ${name()}` : "Suggested"}
						description="Picked from your stack"
						action={
							<Show when={shownSuggestions().length < suggested().length}>
								<LinkButton onClick={() => setAllSuggestions(true)}>
									Show all {suggested().length}
								</LinkButton>
							</Show>
						}
					>
						<For each={shownSuggestions()}>
							{(service) => (
								<SettingsRow
									inline
									mark={<ConnectorGlyph kind={service.id} />}
									label={service.name}
									description={service.blurb}
								>
									{connect(service)}
								</SettingsRow>
							)}
						</For>
					</SettingsGroup>
				</Show>

				<SettingsGroup
					title={shell.desktop() ? "Custom MCP servers" : "Custom MCP"}
					description="Run any MCP server on your machine"
					action={
						<Show when={manager() && shell.desktop()}>
							<LinkButton onClick={() => setAdding(true)}>Add server</LinkButton>
						</Show>
					}
				>
					<For each={custom()}>
						{(connection) => (
							<SettingsRow
								inline
								mark={<ConnectorGlyph kind="custom" />}
								label={connection.name}
								href={workspaceHref(`/settings/connectors/${connection.id}`)}
								description={serverLine(connection, machine())}
							>
								<Switch
									label={`${connection.name} on`}
									checked={connection.enabled}
									disabled={!manager()}
									onChange={(enabled) => void toggle(connection, enabled)}
								/>
							</SettingsRow>
						)}
					</For>
					<Show when={custom().length === 0 && shell.desktop()}>
						<SettingsRow
							label="No servers of your own yet"
							description="A database, an internal API, anything that speaks MCP."
						/>
					</Show>
					<Show when={manager() && !shell.desktop()}>
						<SettingsLinkRow
							leading={<PlusIcon />}
							label="Add MCP server"
							onClick={() => setAdding(true)}
						/>
					</Show>
				</SettingsGroup>
			</Show>

			<Show when={connecting()}>
				{(service) => (
					<ConnectDialog
						service={service()}
						resume={resume() ?? undefined}
						onClose={() => {
							setResume(null);
							setConnecting(null);
						}}
						onConnected={(connection) => {
							setResume(null);
							setConnecting(null);
							notify({ title: `${connection.name} connected` });
							void load();
						}}
					/>
				)}
			</Show>
			<Show when={adding()}>
				<McpServerDialog
					secrets={view()?.secrets ?? []}
					machine={machine()}
					onClose={() => setAdding(false)}
					onAdded={(connection) => {
						setAdding(false);
						notify({ title: `${connection.name} added` });
						void load();
					}}
				/>
			</Show>
		</SettingsPage>
	);
}
