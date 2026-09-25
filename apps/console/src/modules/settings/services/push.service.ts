import { runnerCall } from "@/lib/runner-client";

/** Whether this browser can get notifications from the runner, and what stands in the way. */
export type PushSupport =
	/** No service worker or Push API here (or a dev build, which runs without the worker). */
	| "unsupported"
	/** iPhone and iPad only deliver web notifications to an app added to the Home Screen. */
	| "needs-install"
	/** The person (or their browser) blocked notifications for this site. */
	| "denied"
	| "ready";

function isAppleMobile(): boolean {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
	);
}

function isInstalled(): boolean {
	return (
		matchMedia("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

export async function pushSupport(): Promise<PushSupport> {
	if (
		!("serviceWorker" in navigator) ||
		!("PushManager" in window) ||
		!("Notification" in window)
	) {
		return isAppleMobile() && !isInstalled() ? "needs-install" : "unsupported";
	}
	if (!(await navigator.serviceWorker.getRegistration())) return "unsupported";
	return Notification.permission === "denied" ? "denied" : "ready";
}

/** This device's subscription, when it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
	const registration = await navigator.serviceWorker.getRegistration();
	return (await registration?.pushManager.getSubscription()) ?? null;
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
	const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Ask for permission (this must run from a tap), subscribe with the runner's key and register
 * the device with it. Any older subscription is replaced, in case the runner's key changed.
 */
export async function enablePush(token: string): Promise<void> {
	const permission = await Notification.requestPermission();
	if (permission !== "granted") {
		throw new Error("Notifications are blocked. Allow them for this site, then try again.");
	}
	const { publicKey } = await runnerCall<{ publicKey: string }>("/push/key", token);
	const registration = await navigator.serviceWorker.ready;
	await (await registration.pushManager.getSubscription())?.unsubscribe();
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: fromBase64url(publicKey),
	});
	await runnerCall<void>("/push/subscriptions", token, {
		method: "POST",
		body: JSON.stringify(subscription.toJSON()),
	});
}

export async function disablePush(token: string): Promise<void> {
	const subscription = await currentSubscription();
	if (!subscription) return;
	await runnerCall<void>("/push/subscriptions", token, {
		method: "DELETE",
		body: JSON.stringify({ endpoint: subscription.endpoint }),
	});
	await subscription.unsubscribe();
}

/** Have the runner push a notification to this person's devices now, to check it arrives. */
export async function sendTestPush(token: string): Promise<void> {
	await runnerCall<void>("/push/test", token, { method: "POST" });
}
