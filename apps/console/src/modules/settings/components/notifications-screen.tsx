import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { Alert, Button, SettingsGroup, SettingsRow, Spinner, Switch, Text } from "@/kit";
import { useAuth } from "@/modules/auth";

import {
	currentSubscription,
	disablePush,
	enablePush,
	pushSupport,
	type PushSupport,
	sendTestPush,
} from "../services/push.service";

import { SettingsPage } from "./settings-page";

const BLOCKED: Record<Exclude<PushSupport, "ready">, string> = {
	unsupported: "This browser can't show notifications from Grid.",
	"needs-install":
		"On iPhone and iPad, add Grid to your Home Screen first (Share → Add to Home Screen), then turn this on from there.",
	denied: "Notifications are blocked for this site. Allow them in your browser's site settings.",
};

/**
 * Settings → Notifications: this device hears when an agent finishes or waits for approval in a
 * chat you are not looking at, the way a native app would.
 */
export function NotificationsScreen(): JSX.Element {
	const auth = useAuth();
	const [support, setSupport] = createSignal<PushSupport | null>(null);
	const [enabled, setEnabled] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [tested, setTested] = createSignal(false);

	onSettled(() => {
		void (async () => {
			const found = await pushSupport();
			setSupport(found);
			if (found === "ready") setEnabled(Boolean(await currentSubscription()));
		})();
	});

	async function run(action: (token: string) => Promise<void>): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setBusy(true);
		setError(null);
		try {
			await action(token);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Something went wrong");
		} finally {
			setBusy(false);
			setSupport(await pushSupport());
		}
	}

	const toggle = (on: boolean) =>
		run(async (token) => {
			setTested(false);
			if (on) {
				await enablePush(token);
				setEnabled(true);
			} else {
				await disablePush(token);
				setEnabled(false);
			}
		});

	const test = () =>
		run(async (token) => {
			await sendTestPush(token);
			setTested(true);
		});

	return (
		<SettingsPage
			title="Notifications"
			description="Hear from your agents on this device, even when Grid is in the background."
		>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<SettingsGroup title="This device">
				<SettingsRow
					inline
					label="Agent updates"
					description="When an agent finishes, or needs your approval, in a chat you're not looking at."
				>
					<Show when={busy()}>
						<Spinner label="Saving" />
					</Show>
					<Show
						when={support() === "ready"}
						fallback={
							<Show when={support() === null}>
								<Spinner label="Checking" />
							</Show>
						}
					>
						<Switch
							label="Agent updates on this device"
							checked={enabled()}
							disabled={busy()}
							onChange={(on) => void toggle(on)}
						/>
					</Show>
				</SettingsRow>
				<Show when={support() && support() !== "ready" ? support() : null}>
					{(blocked) => (
						<div class="px-4 py-3.5">
							<Text tone="subtle">{BLOCKED[blocked() as Exclude<PushSupport, "ready">]}</Text>
						</div>
					)}
				</Show>
				<Show when={support() === "ready" && enabled()}>
					<SettingsRow
						inline
						label="Send a test"
						description={tested() ? "Sent — it should appear in a moment." : "Check it arrives."}
					>
						<Button size="sm" disabled={busy()} onClick={() => void test()}>
							Send a test
						</Button>
					</SettingsRow>
				</Show>
			</SettingsGroup>
		</SettingsPage>
	);
}
