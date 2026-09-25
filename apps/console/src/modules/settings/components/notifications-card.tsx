import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { Button, ErrorNotice, SpinnerIcon } from "@/ui";

import {
	currentSubscription,
	disablePush,
	enablePush,
	pushSupport,
	type PushSupport,
	sendTestPush,
} from "../services/push.service";

const BLOCKED: Record<Exclude<PushSupport, "ready">, string> = {
	unsupported: "This browser can't show notifications from Grid.",
	"needs-install":
		"On iPhone and iPad, add Grid to your Home Screen first (Share → Add to Home Screen), then turn this on from there.",
	denied: "Notifications are blocked for this site. Allow them in your browser's site settings.",
};

/**
 * Settings → Agents → Notifications: this device hears when an agent finishes or waits for
 * approval in a chat you are not looking at, the way a native app would.
 */
export function NotificationsCard(): JSX.Element {
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

	const toggle = () =>
		run(async (token) => {
			setTested(false);
			if (enabled()) {
				await disablePush(token);
				setEnabled(false);
			} else {
				await enablePush(token);
				setEnabled(true);
			}
		});

	const test = () =>
		run(async (token) => {
			await sendTestPush(token);
			setTested(true);
		});

	return (
		<section aria-label="Notifications" class="rounded-xl border border-ink/10 bg-ink/3">
			<header class="flex items-center gap-3 px-4 py-3">
				<div class="min-w-0 flex-1">
					<h2 class="font-semibold text-ui">Notifications</h2>
					<p class="text-ink/45 text-ui-xs">
						On this device, when an agent finishes or needs your approval in a chat you're not
						looking at.
					</p>
				</div>
				<Show when={support() === "ready"}>
					<Show when={busy()}>
						<SpinnerIcon class="size-4 text-ink/45" />
					</Show>
					<button
						type="button"
						aria-pressed={enabled() ? "true" : "false"}
						aria-label="Notify me on this device"
						disabled={busy()}
						onClick={() => void toggle()}
						class="focus-ring relative h-5 w-9 shrink-0 rounded-full bg-ink/15 p-0 transition-colors duration-fast aria-pressed:bg-accent disabled:opacity-60 pointer-coarse:h-7 pointer-coarse:w-12"
					>
						<span
							class={`absolute top-0.5 left-0 size-4 rounded-full bg-canvas shadow-sm transition-transform duration-fast pointer-coarse:size-6 ${enabled() ? "translate-x-4.5 pointer-coarse:translate-x-5.5" : "translate-x-0.5"}`}
						/>
					</button>
				</Show>
			</header>
			<Show when={support() && support() !== "ready" ? support() : null}>
				{(blocked) => (
					<p class="border-ink/5 border-t px-4 py-3 text-ink/55 text-ui-sm">
						{BLOCKED[blocked() as Exclude<PushSupport, "ready">]}
					</p>
				)}
			</Show>
			<Show when={error()}>
				{(message) => (
					<div class="px-4 pb-3">
						<ErrorNotice message={message()} />
					</div>
				)}
			</Show>
			<Show when={support() === "ready" && enabled()}>
				<div class="flex flex-wrap items-center gap-3 border-ink/5 border-t px-4 py-3">
					<Button variant="ghost" disabled={busy()} onClick={() => void test()}>
						Send a test
					</Button>
					<Show when={tested()}>
						<p aria-live="polite" class="text-ink/55 text-ui-sm">
							Sent — it should appear in a moment.
						</p>
					</Show>
				</div>
			</Show>
		</section>
	);
}
