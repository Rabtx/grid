/**
 * Web Push with nothing but WebCrypto: payload encryption (RFC 8291, aes128gcm) and the VAPID
 * signature that identifies this runner to the push service (RFC 8292). Browsers only accept
 * pushes that are encrypted to the subscription's keys, so the push service never sees the text.
 */

import type { webcrypto } from "node:crypto";

type JsonWebKey = webcrypto.JsonWebKey;

/** Bytes WebCrypto accepts: backed by a plain ArrayBuffer. */
type Bytes = Uint8Array<ArrayBuffer>;

/** A browser's push subscription, as `PushSubscription.toJSON()` gives it. */
export type PushSubscriptionKeys = {
	endpoint: string;
	/** The browser's P-256 public key, base64url. */
	p256dh: string;
	/** The browser's 16-byte authentication secret, base64url. */
	auth: string;
};

/** This runner's VAPID key pair, as JWKs so it can be kept in the database. */
export type VapidKeys = { publicKey: JsonWebKey; privateKey: JsonWebKey };

const RECORD_SIZE = 4096;
const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}

export function fromBase64url(text: string): Bytes {
	return new Uint8Array(Buffer.from(text, "base64url"));
}

function concat(...parts: Uint8Array[]): Bytes {
	const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
	const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "HKDF", hash: "SHA-256", salt, info },
		key,
		bytes * 8,
	);
	return new Uint8Array(bits);
}

export async function generateVapidKeys(): Promise<VapidKeys> {
	const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
		"sign",
		"verify",
	]);
	return {
		publicKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
		privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
	};
}

/** The VAPID public key as the browser's `applicationServerKey` wants it: raw, base64url. */
export async function vapidPublicKey(keys: VapidKeys): Promise<string> {
	const key = await crypto.subtle.importKey(
		"jwk",
		keys.publicKey,
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["verify"],
	);
	return base64url(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

/**
 * The `Authorization` header for one push service: a short-lived ES256 JWT naming its origin,
 * signed with the VAPID private key. WebCrypto signs as raw r‖s, which is exactly the JWS form.
 */
export async function vapidAuthorization(
	endpoint: string,
	keys: VapidKeys,
	subject: string,
	now = Date.now(),
): Promise<string> {
	const header = base64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
	const claims = base64url(
		encoder.encode(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				exp: Math.floor(now / 1000) + 12 * 60 * 60,
				sub: subject,
			}),
		),
	);
	const key = await crypto.subtle.importKey(
		"jwk",
		keys.privateKey,
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: "SHA-256" },
		key,
		encoder.encode(`${header}.${claims}`),
	);
	const jwt = `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
	return `vapid t=${jwt}, k=${await vapidPublicKey(keys)}`;
}

/**
 * Encrypt one payload to a subscription (RFC 8291): a fresh ECDH key per message, keyed with the
 * browser's authentication secret, as a single aes128gcm record. `ephemeral` and `salt` are only
 * passed in by tests, to check against the RFC's worked example.
 */
export async function encryptPayload(
	subscription: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
	payload: Bytes,
	ephemeral?: CryptoKeyPair,
	salt: Bytes = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Bytes> {
	const clientPublic = fromBase64url(subscription.p256dh);
	const authSecret = fromBase64url(subscription.auth);
	const serverKeys =
		ephemeral ??
		((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
			"deriveBits",
		])) as CryptoKeyPair);
	const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
	const clientKey = await crypto.subtle.importKey(
		"raw",
		clientPublic,
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[],
	);
	const shared = new Uint8Array(
		await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeys.privateKey, 256),
	);

	const keyInfo = concat(encoder.encode("WebPush: info\0"), clientPublic, serverPublic);
	const ikm = await hkdf(authSecret, shared, keyInfo, 32);
	const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
	const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

	const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
	// One record, so the padding delimiter is 0x02 ("last record") with no padding after it.
	const sealed = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv: nonce },
			key,
			concat(payload, new Uint8Array([2])),
		),
	);

	const header = new Uint8Array(16 + 4 + 1 + serverPublic.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, RECORD_SIZE);
	header[20] = serverPublic.length;
	header.set(serverPublic, 21);
	return concat(header, sealed);
}

export type PushResult = "sent" | "expired" | "failed";

/**
 * Deliver one notification. "expired" means the browser dropped the subscription (404/410) and
 * it should be forgotten; any other failure is logged by the caller and retried on the next event.
 */
export async function sendPush(
	subscription: PushSubscriptionKeys,
	payload: unknown,
	keys: VapidKeys,
	subject: string,
	fetcher: typeof fetch = fetch,
): Promise<PushResult> {
	const body = await encryptPayload(subscription, encoder.encode(JSON.stringify(payload)));
	const response = await fetcher(subscription.endpoint, {
		method: "POST",
		headers: {
			Authorization: await vapidAuthorization(subscription.endpoint, keys, subject),
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
			// A day: an agent that finished while the phone was off is still worth hearing about.
			TTL: String(24 * 60 * 60),
			Urgency: "high",
		},
		body,
	});
	if (response.ok) return "sent";
	if (response.status === 404 || response.status === 410) return "expired";
	return "failed";
}
