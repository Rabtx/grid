import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";

import {
	Alert,
	Button,
	button,
	Dialog,
	Field,
	Input,
	ListCard,
	ProbeResult,
	Row,
	Segmented,
	Spinner,
	Stack,
	StepTrail,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";

import { ConnectorGlyph } from "../lib/connectors";
import { connectorsService } from "../services/connectors.service";
import type { CatalogService, Connection, HeldGrant, Rule, SignIn } from "../types/connector.types";
import { GithubCli } from "./github-cli";
import { RuleRow } from "./rule-row";

const STEPS = ["Sign in", "Tools", "Agent access"] as const;
const SHOWN_TOOLS = 12;

const WAY_LABEL: Record<SignIn, string> = {
	oauth: "Sign in",
	key: "API key",
	gh: "GitHub CLI",
};

/** Where a connector's sign-in comes back to: this console, outside any workspace. */
export function signInReturn(): string {
	return `${window.location.origin}/oauth/callback`;
}

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message ? cause.message : fallback;
}

/**
 * Connecting a service (Figma 24 · Connectors · Connect): sign in — in the service's own window,
 * with an API key, or GitHub through this machine's GitHub CLI — then what its server offers,
 * then what agents may do with it, starting from the catalog's safe defaults.
 */
export function ConnectDialog(props: {
	service: CatalogService;
	/** A sign-in already finished in its own window, to pick up at the next step. */
	resume?: string;
	onClose: () => void;
	onConnected: (connection: Connection) => void;
}): JSX.Element {
	const auth = useAuth();
	const [step, setStep] = createSignal(0);
	// The way it starts on; the dialog is opened for one service and keeps the person's choice.
	const [way, setWay] = createSignal<SignIn>(untrack(() => props.service.signIn[0]) ?? "oauth");
	const [key, setKey] = createSignal("");
	const [held, setHeld] = createSignal<HeldGrant | null>(null);
	const [rules, setRules] = createSignal<Record<string, Rule>>(
		untrack(() =>
			Object.fromEntries(props.service.capabilities.map((item) => [item.id, item.initial])),
		),
	);
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [cliReady, setCliReady] = createSignal(false);
	let waiting: string | null = null;
	// On phones and in the installed app, the service's sign-in page opens from a real link the
	// person taps, not from a blank window pointed at it afterwards: there, that blank window and the
	// tab that shows the service can be separate browser sessions with separate cookies, and a
	// service that keeps its sign-in in a cookie (Neon) then refuses the approval as expired.
	const [openUrl, setOpenUrl] = createSignal<string | null>(null);
	const [opened, setOpened] = createSignal(false);
	const direct = () =>
		matchMedia("(pointer: coarse)").matches || matchMedia("(display-mode: standalone)").matches;

	async function run<T>(work: (token: string) => Promise<T>, failure: string): Promise<T | null> {
		const token = auth.token();
		if (!token) return null;
		setBusy(true);
		setError(null);
		try {
			return await work(token);
		} catch (cause) {
			setError(reason(cause, failure));
			return null;
		} finally {
			setBusy(false);
		}
	}

	function signedIn(grant: HeldGrant | null): void {
		if (!grant) return;
		setHeld(grant);
		setStep(1);
	}

	// The sign-in finishes in its own window, which hands the code to the runner itself (see
	// OAuthCallback). This dialog asks the runner how it went: on a timer, at once when that window
	// says it is done, and when the person comes back to this page (a phone back from its browser).
	let poll: ReturnType<typeof setTimeout> | undefined;
	async function check(): Promise<void> {
		const state = waiting;
		const token = auth.token();
		if (!state || !token) return;
		clearTimeout(poll);
		try {
			const outcome = await connectorsService.signInOutcome(token, state);
			if (waiting !== state) return;
			if (outcome.status === "waiting") {
				poll = setTimeout(() => void check(), 1500);
				return;
			}
			waiting = null;
			setBusy(false);
			if (outcome.status === "done") signedIn(outcome);
			else {
				setError(outcome.message);
				// That sign-in is spent: the next try starts a fresh one.
				setOpenUrl(null);
				setOpened(false);
			}
		} catch {
			// The runner did not answer this time; the sign-in is still worth waiting for.
			if (waiting === state) poll = setTimeout(() => void check(), 3000);
		}
	}

	onSettled(() => {
		const listen = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) return;
			const data = event.data as { type?: string; state?: string };
			if (data?.type === "grid-connector-sign-in" && waiting && data.state === waiting)
				void check();
		};
		const back = () => {
			if (document.visibilityState === "visible" && waiting) void check();
		};
		window.addEventListener("message", listen);
		document.addEventListener("visibilitychange", back);
		if (props.resume) {
			waiting = props.resume;
			setBusy(true);
			void check();
		}
		return () => {
			waiting = null;
			clearTimeout(poll);
			window.removeEventListener("message", listen);
			document.removeEventListener("visibilitychange", back);
		};
	});

	async function signIn(): Promise<void> {
		if (busy()) return;
		if (way() === "key") {
			if (!key().trim()) return;
			signedIn(
				await run(
					(token) => connectorsService.useKey(token, { service: props.service.id, key: key() }),
					"That key did not work",
				),
			);
			return;
		}
		if (way() === "gh") {
			signedIn(
				await run((token) => connectorsService.useGithubCli(token), "GitHub did not answer"),
			);
			return;
		}
		if (direct()) {
			setOpenUrl(null);
			setOpened(false);
			const prepared = await run(
				(token) =>
					connectorsService.startSignIn(token, {
						service: props.service.id,
						redirectUri: signInReturn(),
					}),
				"Could not start signing in",
			);
			if (!prepared) return;
			waiting = prepared.state;
			setOpenUrl(prepared.url);
			void check();
			return;
		}
		// Desktop: opened at once, inside the click, so the browser does not take it for a pop-up ad.
		// A fresh window each time, never a named one reused from an earlier attempt.
		const popup = window.open("about:blank", "_blank", "popup,width=520,height=720");
		const started = await run(
			(token) =>
				connectorsService.startSignIn(token, {
					service: props.service.id,
					redirectUri: signInReturn(),
				}),
			"Could not start signing in",
		);
		if (!started) {
			popup?.close();
			return;
		}
		waiting = started.state;
		if (popup) popup.location.href = started.url;
		else window.open(started.url, "_blank");
		setBusy(true);
		void check();
	}

	async function connect(): Promise<void> {
		const grant = held();
		if (!grant || busy()) return;
		const added = await run(
			(token) =>
				connectorsService.addService(token, {
					service: props.service.id,
					grant: grant.grant,
					rules: rules(),
				}),
			"Not connected",
		);
		if (added) props.onConnected(added);
	}

	const tools = () => held()?.tools.map((tool) => tool.name) ?? [];

	return (
		<Dialog
			open={true}
			title={`Connect ${props.service.name}`}
			description={
				held()
					? `Official ${props.service.name} MCP server · ${tools().length} tools`
					: `Official ${props.service.name} MCP server`
			}
			width="34rem"
			onClose={props.onClose}
			footer={
				<>
					<Show when={step() > 0}>
						<Button variant="ghost" disabled={busy()} onClick={() => setStep(step() - 1)}>
							Back
						</Button>
					</Show>
					<Show when={step() === 0 && way() === "oauth" ? openUrl() : null}>
						{(url) => (
							<a
								href={url()}
								target="_blank"
								rel="noopener"
								class={button({ variant: "primary" })}
								onClick={() => setOpened(true)}
							>
								<Show when={opened()} fallback={`Continue to ${props.service.name}`}>
									<Spinner /> Waiting for the sign-in…
								</Show>
							</a>
						)}
					</Show>
					<Show when={step() === 0 && !(way() === "oauth" && openUrl())}>
						<Button
							variant="primary"
							disabled={
								busy() || (way() === "key" && !key().trim()) || (way() === "gh" && !cliReady())
							}
							onClick={() => void signIn()}
						>
							<Show
								when={busy()}
								fallback={way() === "oauth" ? `Sign in to ${props.service.name}` : "Continue"}
							>
								<Spinner /> {way() === "oauth" ? "Waiting for the sign-in…" : "Checking…"}
							</Show>
						</Button>
					</Show>
					<Show when={step() === 1}>
						<Button variant="primary" onClick={() => setStep(2)}>
							Continue
						</Button>
					</Show>
					<Show when={step() === 2}>
						<Button variant="primary" disabled={busy()} onClick={() => void connect()}>
							<Show when={busy()} fallback={`Connect ${props.service.name}`}>
								<Spinner /> Connecting…
							</Show>
						</Button>
					</Show>
				</>
			}
		>
			<Stack gap={4}>
				<Row gap={3}>
					<ConnectorGlyph kind={props.service.id} />
					<StepTrail steps={STEPS} current={step()} />
				</Row>
				<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>

				<Show when={step() === 0}>
					<Stack gap={3}>
						<Show when={props.service.signIn.length > 1}>
							<Segmented<SignIn>
								label="How to sign in"
								block
								value={way()}
								onChange={(next) => {
									setWay(next);
									setError(null);
								}}
								options={props.service.signIn.map((value) => ({ value, label: WAY_LABEL[value] }))}
							/>
						</Show>
						<Show when={way() === "oauth"}>
							<Text tone="subtle">
								{props.service.name} opens in its own window. Grid keeps the sign-in encrypted on
								this machine and renews it as it runs out.
							</Text>
						</Show>
						<Show when={way() === "gh"}>
							<GithubCli onReady={setCliReady} />
						</Show>
						<Show when={way() === "key"}>
							<Field
								label="API key"
								hint={`A key from ${props.service.name}'s settings. It is stored encrypted on this machine.`}
							>
								{(id) => (
									<Input
										id={id}
										type="password"
										autocomplete="off"
										value={key()}
										onInput={(event) => setKey(event.currentTarget.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") void signIn();
										}}
									/>
								)}
							</Field>
						</Show>
					</Stack>
				</Show>

				<Show when={step() === 1 && held()}>
					{(grant) => (
						<ProbeResult
							ok
							title={`Connected · ${grant().tools.length} tools found`}
							detail={`${grant().ms} ms`}
							tools={[
								...tools().slice(0, SHOWN_TOOLS),
								...(tools().length > SHOWN_TOOLS ? [`+${tools().length - SHOWN_TOOLS} more`] : []),
							]}
						/>
					)}
				</Show>

				<Show when={step() === 2}>
					<Stack gap={3}>
						<Text tone="strong">What can agents do with {props.service.name}?</Text>
						<ListCard>
							<For each={props.service.capabilities}>
								{(capability) => (
									<RuleRow
										capability={capability}
										value={rules()[capability.id] ?? capability.initial}
										onChange={(rule) => setRules({ ...rules(), [capability.id]: rule })}
									/>
								)}
							</For>
						</ListCard>
						<Text size="caption" tone="subtle">
							Starting read-only is the safe default. Change it any time in Connectors. Every action
							shows up in the connector's activity.
						</Text>
					</Stack>
				</Show>
			</Stack>
		</Dialog>
	);
}
