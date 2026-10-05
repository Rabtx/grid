import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import {
	Alert,
	Button,
	Dialog,
	GateRow,
	ListCard,
	notify,
	OptionStrip,
	ShieldIcon,
	Spinner,
	Switch,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";

import { bareUrl, plural, promotionLine } from "../lib/ship-look";
import { shipService } from "../services/ship.service";
import type { EnvironmentDetail } from "../types/ship.types";

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * Promote (Figma 19 · Promote): what stands behind the change — its checks, its migrations, the
 * way back — and whether Grid watches the site for 15 minutes after, before it goes out.
 */
export function PromoteDialog(props: {
	open: boolean;
	project: string;
	environment: EnvironmentDetail;
	onClose: () => void;
	onDone: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [watch, setWatch] = createSignal(true);
	const [sending, setSending] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const promotion = () => props.environment.promotion;
	const live = () => props.environment.history.find((entry) => entry.state === "live");
	const canReturn = () =>
		Boolean(
			live() &&
			(props.environment.settings.rollback || /\/actions\/runs\//.test(live()?.logUrl ?? "")),
		);

	const checks = () => {
		const found = promotion()?.checks;
		if (!found?.total) return { state: "skipped" as const, title: "No checks ran on this commit" };
		if (found.failed)
			return {
				state: "failure" as const,
				title: `${found.failed} of ${plural(found.total, "check")} failed`,
			};
		if (found.pending)
			return {
				state: "pending" as const,
				title: `${plural(found.pending, "check")} still running`,
			};
		return { state: "success" as const, title: `All ${plural(found.total, "check")} passed` };
	};

	async function promote(): Promise<void> {
		const token = auth.token();
		if (!token || sending()) return;
		setSending(true);
		setError(null);
		try {
			const done = await shipService.promote(
				token,
				props.project,
				props.environment.name,
				watch() && Boolean(props.environment.url),
			);
			notify({ title: `Promoting ${done.version} to ${props.environment.name}`, tone: "success" });
			props.onDone();
		} catch (cause) {
			setError(message(cause, "Could not promote"));
		} finally {
			setSending(false);
		}
	}

	return (
		<Dialog
			open={props.open}
			onClose={() => props.onClose()}
			title={`Promote ${promotion()?.version ?? ""} to ${props.environment.name}?`}
			description={promotionLine(promotion()?.ahead ?? null, props.environment.url)}
			width="32rem"
			footer={
				<>
					<Text size="caption" tone="subtle" class="mr-auto max-md:hidden">
						Runs as you on GitHub
					</Text>
					<Button onClick={() => props.onClose()}>Cancel</Button>
					<Button
						variant="primary"
						disabled={sending() || checks().state === "failure"}
						onClick={() => void promote()}
					>
						<Show when={sending()} fallback="Promote">
							<Spinner /> Promoting…
						</Show>
					</Button>
				</>
			}
		>
			<div class="flex flex-col gap-4">
				<Show when={error()}>{(reason) => <Alert tone="danger" title={reason()} />}</Show>
				<ListCard>
					<GateRow
						state={checks().state}
						title={checks().title}
						detail={`${promotion()?.from.version ?? ""} on ${promotion()?.from.name ?? ""}`}
					/>
					<Show when={promotion()?.migrations.length}>
						<GateRow
							state="skipped"
							title={
								promotion()?.migrations.length === 1
									? `Migration ${promotion()?.migrations[0] ?? ""}`
									: `${plural(promotion()?.migrations.length ?? 0, "migration")}`
							}
							detail="Runs with the deploy: read it before you promote"
						/>
					</Show>
					<Show
						when={live()}
						fallback={
							<GateRow
								state="skipped"
								title="Nothing to go back to"
								detail={`The first deploy to ${props.environment.name}`}
							/>
						}
					>
						<GateRow
							state={canReturn() ? "success" : "skipped"}
							title={canReturn() ? "Rollback is ready" : "No way back from Grid"}
							detail={
								canReturn()
									? `${live()?.version ?? ""} can be deployed again from the history`
									: "Set a rollback command in this environment's settings"
							}
						/>
					</Show>
					<GateRow state="success" title="How it goes out" detail={promotion()?.method} />
				</ListCard>
				<OptionStrip
					icon={<ShieldIcon />}
					title="Watch for 15 minutes after"
					detail={
						props.environment.url
							? `If ${bareUrl(props.environment.url)} stops answering, Grid rolls back on its own and tells you`
							: "Add the site's address in this environment's settings to watch it"
					}
					control={
						<Switch
							label="Watch for 15 minutes after"
							checked={watch() && Boolean(props.environment.url) && canReturn()}
							disabled={!props.environment.url || !canReturn()}
							onChange={setWatch}
						/>
					}
				/>
			</div>
		</Dialog>
	);
}
