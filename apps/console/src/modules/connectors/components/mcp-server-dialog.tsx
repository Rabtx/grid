import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import {
	Alert,
	Button,
	CloseIcon,
	Dialog,
	Field,
	IconButton,
	Input,
	LinkButton,
	ProbeResult,
	Row,
	Segmented,
	Select,
	Spinner,
	Stack,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";

import { ConnectorGlyph } from "../lib/connectors";
import { connectorsService } from "../services/connectors.service";
import type { Connection, CustomServerInput, Probe, SecretRef } from "../types/connector.types";

type Variable = { name: string; source: "vault" | "new" | "value"; secret: string; value: string };

const VARIABLE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const NEW_SECRET = "__new__";

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message ? cause.message : fallback;
}

/**
 * Adding the workspace's own MCP server (Figma 24 · Connectors · Custom MCP): a name, a command
 * on this machine or a URL, the variables it needs from the vault, and a test that lists its tools
 * before it is added. It runs on this machine, behind the same rules as every connector.
 */
export function McpServerDialog(props: {
	secrets: readonly { name: string }[];
	machine: string;
	onClose: () => void;
	onAdded: (connection: Connection) => void;
}): JSX.Element {
	const auth = useAuth();
	const [name, setName] = createSignal("");
	const [transport, setTransport] = createSignal<"stdio" | "http">("stdio");
	const [command, setCommand] = createSignal("");
	const [url, setUrl] = createSignal("");
	const [key, setKey] = createSignal("");
	const [variables, setVariables] = createSignal<Variable[]>([]);
	const [tested, setTested] = createSignal<Probe | null>(null);
	const [failed, setFailed] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);

	const valid = () =>
		Boolean(name().trim()) &&
		(transport() === "stdio" ? Boolean(command().trim()) : /^https?:\/\//.test(url().trim())) &&
		variables().every(
			(item) =>
				VARIABLE.test(item.name) &&
				(item.source === "vault" ? Boolean(item.secret) : Boolean(item.value)),
		);

	/** New secrets go to the vault first, under the variable's name; the server then reads them there. */
	async function server(token: string): Promise<CustomServerInput> {
		const env: Record<string, SecretRef> = {};
		for (const item of variables()) {
			if (item.source === "new") {
				await connectorsService.saveSecret(token, item.name, item.value);
				env[item.name] = { secret: item.name };
			} else if (item.source === "vault") env[item.name] = { secret: item.secret };
			else env[item.name] = { value: item.value };
		}
		return transport() === "stdio"
			? { name: name().trim(), transport: "stdio", command: command().trim(), env }
			: {
					name: name().trim(),
					transport: "http",
					url: url().trim(),
					...(key().trim() ? { key: key().trim() } : {}),
				};
	}

	async function test(): Promise<void> {
		const token = auth.token();
		if (!token || !valid() || busy()) return;
		setBusy(true);
		setFailed(null);
		setTested(null);
		try {
			setTested(await connectorsService.tryServer(token, await server(token)));
		} catch (cause) {
			setFailed(reason(cause, "The server did not answer"));
		} finally {
			setBusy(false);
		}
	}

	async function add(): Promise<void> {
		const token = auth.token();
		if (!token || !valid() || busy()) return;
		setBusy(true);
		setFailed(null);
		try {
			props.onAdded(await connectorsService.addServer(token, await server(token)));
		} catch (cause) {
			setFailed(reason(cause, "Not added"));
		} finally {
			setBusy(false);
		}
	}

	const change = (index: number, patch: Partial<Variable>) =>
		setVariables(variables().map((item, at) => (at === index ? { ...item, ...patch } : item)));

	return (
		<Dialog
			open={true}
			title="Add an MCP server"
			description="Any MCP server works. It runs on your machine, with secrets from the vault."
			width="36rem"
			onClose={props.onClose}
			footer={
				<>
					<Show when={tested() || failed()}>
						<LinkButton onClick={() => void test()}>Test again</LinkButton>
					</Show>
					<Button onClick={props.onClose}>Cancel</Button>
					<Show
						when={tested()}
						fallback={
							<Button variant="primary" disabled={!valid() || busy()} onClick={() => void test()}>
								<Show when={busy()} fallback="Test server">
									<Spinner /> Testing…
								</Show>
							</Button>
						}
					>
						<Button variant="primary" disabled={!valid() || busy()} onClick={() => void add()}>
							<Show when={busy()} fallback="Add server">
								<Spinner /> Adding…
							</Show>
						</Button>
					</Show>
				</>
			}
		>
			<Stack gap={4}>
				<Row gap={3}>
					<ConnectorGlyph kind="custom" />
					<Text tone="subtle" size="caption">
						Grid stands between agents and the server, so its tools follow the workspace's rules.
					</Text>
				</Row>
				<Field label="Name">
					{(id) => (
						<Input
							id={id}
							maxlength={60}
							placeholder="Postgres · read only"
							value={name()}
							onInput={(event) => {
								setName(event.currentTarget.value);
								setTested(null);
							}}
						/>
					)}
				</Field>
				<Stack gap={1.5}>
					<Text size="caption" tone="subtle">
						Runs as
					</Text>
					<Segmented<"stdio" | "http">
						label="Runs as"
						block
						value={transport()}
						onChange={(next) => {
							setTransport(next);
							setTested(null);
						}}
						options={[
							{ value: "stdio", label: "Local command" },
							{ value: "http", label: "Remote URL" },
						]}
					/>
				</Stack>
				<Show
					when={transport() === "stdio"}
					fallback={
						<>
							<Field label="URL">
								{(id) => (
									<Input
										id={id}
										placeholder="https://mcp.example.com/mcp"
										value={url()}
										onInput={(event) => {
											setUrl(event.currentTarget.value);
											setTested(null);
										}}
									/>
								)}
							</Field>
							<Field label="Key" hint="Sent as a bearer token, when the server needs one.">
								{(id) => (
									<Input
										id={id}
										type="password"
										autocomplete="off"
										value={key()}
										onInput={(event) => setKey(event.currentTarget.value)}
									/>
								)}
							</Field>
						</>
					}
				>
					<Field label="Command">
						{(id) => (
							<Input
								id={id}
								placeholder="npx -y @modelcontextprotocol/server-postgres $DATABASE_URL"
								value={command()}
								onInput={(event) => {
									setCommand(event.currentTarget.value);
									setTested(null);
								}}
							/>
						)}
					</Field>
					<Stack gap={2}>
						<Row justify="between">
							<Text size="caption" tone="subtle">
								Secrets
							</Text>
							<LinkButton
								tone="accent"
								onClick={() =>
									setVariables([
										...variables(),
										{
											name: "",
											source: props.secrets.length ? "vault" : "new",
											secret: props.secrets[0]?.name ?? "",
											value: "",
										},
									])
								}
							>
								Add a variable
							</LinkButton>
						</Row>
						<Show
							when={variables().length > 0}
							fallback={
								<Text size="caption" tone="subtle">
									Variables the command reads (DATABASE_URL), each from the vault.
								</Text>
							}
						>
							<For each={variables()}>
								{(item, index) => (
									<Row gap={2}>
										<Input
											aria-label="Variable"
											placeholder="DATABASE_URL"
											value={item.name}
											onInput={(event) => {
												change(index(), { name: event.currentTarget.value });
												setTested(null);
											}}
										/>
										<Select<string>
											label="From"
											value={item.source === "vault" ? item.secret : NEW_SECRET}
											onChange={(choice) =>
												change(
													index(),
													choice === NEW_SECRET
														? { source: "new" }
														: { source: "vault", secret: choice },
												)
											}
											groups={[
												{
													label: "From the vault",
													options: props.secrets.map((secret) => ({
														value: secret.name,
														label: secret.name,
													})),
												},
												{ options: [{ value: NEW_SECRET, label: "A new secret" }] },
											]}
										/>
										<Show when={item.source === "new"}>
											<Input
												aria-label="Secret value"
												type="password"
												autocomplete="off"
												placeholder="Value"
												value={item.value}
												onInput={(event) => change(index(), { value: event.currentTarget.value })}
											/>
										</Show>
										<IconButton
											label="Remove variable"
											size="sm"
											onClick={() => setVariables(variables().filter((_, at) => at !== index()))}
										>
											<CloseIcon />
										</IconButton>
									</Row>
								)}
							</For>
						</Show>
					</Stack>
					<Field label="Runs on" hint="Other machines join this list once they can run servers.">
						{(id) => <Input id={id} value={props.machine} disabled />}
					</Field>
				</Show>
				<Show when={tested()}>
					{(probe) => (
						<ProbeResult
							ok
							title={`Connected · ${probe().tools.length} tools found`}
							detail={`${probe().ms} ms`}
							tools={probe().tools.map((tool) => tool.name)}
						/>
					)}
				</Show>
				<Show when={failed()}>
					{(message) => (
						<Alert tone="danger" title="The server did not answer">
							{message()}
						</Alert>
					)}
				</Show>
			</Stack>
		</Dialog>
	);
}
