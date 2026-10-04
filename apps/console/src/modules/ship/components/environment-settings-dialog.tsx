import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { Alert, Button, Dialog, Field, Input, Spinner, Stack, Text } from "@/kit";
import { useAuth } from "@/modules/auth";

import { envTitle } from "../lib/ship-look";
import { shipService } from "../services/ship.service";
import type { EnvironmentDetail } from "../types/ship.types";

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

/**
 * An environment's settings: the site Grid checks, and commands for a host Grid can't drive from
 * the project's workflows. A command runs in the project's folder with the commit in `$GRID_SHA`.
 */
export function EnvironmentSettingsDialog(props: {
	open: boolean;
	project: string;
	environment: EnvironmentDetail;
	onClose: () => void;
	onSaved: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [url, setUrl] = createSignal("");
	const [promote, setPromote] = createSignal("");
	const [rollback, setRollback] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	createEffect(
		() => props.open,
		(open) => {
			if (!open) return;
			const saved = props.environment.settings;
			setUrl(saved.url ?? "");
			setPromote(saved.promote ?? "");
			setRollback(saved.rollback ?? "");
			setError(null);
		},
	);

	const badUrl = () => Boolean(url().trim()) && !/^https?:\/\/\S+$/.test(url().trim());

	async function save(): Promise<void> {
		const token = auth.token();
		if (!token || saving() || badUrl()) return;
		setSaving(true);
		setError(null);
		try {
			await shipService.saveSettings(token, props.project, props.environment.name, {
				url: url().trim(),
				promote: promote().trim(),
				rollback: rollback().trim(),
			});
			props.onSaved();
		} catch (cause) {
			setError(message(cause, "Could not save"));
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog
			open={props.open}
			onClose={() => props.onClose()}
			title={`${envTitle(props.environment.name)} settings`}
			description={props.environment.method}
			width="32rem"
			footer={
				<>
					<Button onClick={() => props.onClose()}>Cancel</Button>
					<Button variant="primary" disabled={saving() || badUrl()} onClick={() => void save()}>
						<Show when={saving()} fallback="Save">
							<Spinner /> Saving…
						</Show>
					</Button>
				</>
			}
		>
			<Stack gap={4}>
				<Show when={error()}>{(reason) => <Alert tone="danger" title={reason()} />}</Show>
				<Field
					label="Site address"
					hint="Grid checks it every 5 minutes while anyone looks at Ship, for uptime and response time."
					error={badUrl() ? "Start it with https://" : null}
				>
					{(id) => (
						<Input
							id={id}
							type="url"
							placeholder={props.environment.url ?? "https://app.example.com"}
							value={url()}
							onInput={(event) => setUrl(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Field
					label="Promote command"
					hint="Replaces what Grid worked out from your workflows. The commit is in $GRID_SHA, the version in $GRID_VERSION."
				>
					{(id) => (
						<Input
							id={id}
							class="font-mono"
							placeholder="vercel promote $GRID_SHA --yes"
							value={promote()}
							onInput={(event) => setPromote(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Field
					label="Rollback command"
					hint="Without one, Grid runs the GitHub Actions job that shipped the old deploy again."
				>
					{(id) => (
						<Input
							id={id}
							class="font-mono"
							placeholder="vercel rollback $GRID_SHA --yes"
							value={rollback()}
							onInput={(event) => setRollback(event.currentTarget.value)}
						/>
					)}
				</Field>
				<Text size="caption" tone="subtle">
					Commands run in the project's folder on the machine it lives on.
				</Text>
			</Stack>
		</Dialog>
	);
}
