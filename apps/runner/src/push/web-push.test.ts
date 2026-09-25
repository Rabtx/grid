import { describe, expect, it } from "bun:test";

import {
	base64url,
	encryptPayload,
	fromBase64url,
	generateVapidKeys,
	sendPush,
	vapidAuthorization,
	vapidPublicKey,
} from "./web-push";

/** RFC 8291 appendix A: the worked example every Web Push implementation is checked against. */
const RFC = {
	plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
	serverPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
	serverPublic:
		"BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
	clientPublic:
		"BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
	salt: "DGv6ra1nlYgDCS1FRnbzlw",
	auth: "BTBZMqHH6r4Tts7J_aSIgg",
	header:
		"DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
	body: "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
};

async function rfcServerKeys(): Promise<CryptoKeyPair> {
	const raw = fromBase64url(RFC.serverPublic);
	const jwk = {
		kty: "EC",
		crv: "P-256",
		x: base64url(raw.slice(1, 33)),
		y: base64url(raw.slice(33, 65)),
	};
	const curve = { name: "ECDH", namedCurve: "P-256" };
	return {
		publicKey: await crypto.subtle.importKey("jwk", jwk, curve, true, []),
		privateKey: await crypto.subtle.importKey(
			"jwk",
			{ ...jwk, d: RFC.serverPrivate },
			curve,
			true,
			["deriveBits"],
		),
	};
}

describe("encryptPayload", () => {
	it("matches the RFC 8291 worked example byte for byte", async () => {
		const message = await encryptPayload(
			{ p256dh: RFC.clientPublic, auth: RFC.auth },
			fromBase64url(RFC.plaintext),
			await rfcServerKeys(),
			fromBase64url(RFC.salt),
		);
		expect(base64url(message.slice(0, 86))).toBe(RFC.header);
		expect(base64url(message.slice(86))).toBe(RFC.body);
	});
});

describe("vapidAuthorization", () => {
	it("signs a JWT for the push service's origin that verifies with the public key", async () => {
		const keys = await generateVapidKeys();
		const header = await vapidAuthorization(
			"https://fcm.googleapis.com/fcm/send/abc",
			keys,
			"mailto:owner@grid.local",
			1_700_000_000_000,
		);
		const match = header.match(/^vapid t=([^,]+), k=(.+)$/);
		expect(match).not.toBeNull();
		const [, jwt, k] = match as RegExpMatchArray;
		expect(k).toBe(await vapidPublicKey(keys));

		const [head, claims, signature] = jwt.split(".");
		expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
			aud: "https://fcm.googleapis.com",
			exp: 1_700_000_000 + 12 * 60 * 60,
			sub: "mailto:owner@grid.local",
		});
		const verifier = await crypto.subtle.importKey(
			"raw",
			fromBase64url(k),
			{ name: "ECDSA", namedCurve: "P-256" },
			false,
			["verify"],
		);
		const valid = await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			verifier,
			fromBase64url(signature),
			new TextEncoder().encode(`${head}.${claims}`),
		);
		expect(valid).toBe(true);
	});
});

describe("sendPush", () => {
	const subscription = {
		endpoint: "https://fcm.googleapis.com/fcm/send/abc",
		p256dh: RFC.clientPublic,
		auth: RFC.auth,
	};

	it("posts an encrypted body with the Web Push headers", async () => {
		const keys = await generateVapidKeys();
		let seen: { url: string; init: RequestInit } | null = null;
		const result = await sendPush(subscription, { title: "Done" }, keys, "mailto:a@b.c", (async (
			url: string,
			init: RequestInit,
		) => {
			seen = { url, init };
			return new Response(null, { status: 201 });
		}) as unknown as typeof fetch);
		expect(result).toBe("sent");
		const sent = seen as unknown as { url: string; init: RequestInit };
		expect(sent.url).toBe(subscription.endpoint);
		const headers = sent.init.headers as Record<string, string>;
		expect(headers["Content-Encoding"]).toBe("aes128gcm");
		expect(headers.Authorization).toStartWith("vapid t=");
		// Header (86 bytes) + the 16-byte GCM tag + JSON + the delimiter: never the plain text.
		const body = sent.init.body as Uint8Array;
		expect(body.length).toBe(86 + 16 + JSON.stringify({ title: "Done" }).length + 1);
		expect(new TextDecoder().decode(body)).not.toContain("Done");
	});

	it("reports a subscription the browser dropped as expired", async () => {
		const keys = await generateVapidKeys();
		const gone = (async () => new Response(null, { status: 410 })) as unknown as typeof fetch;
		expect(await sendPush(subscription, {}, keys, "mailto:a@b.c", gone)).toBe("expired");
		const busy = (async () => new Response(null, { status: 429 })) as unknown as typeof fetch;
		expect(await sendPush(subscription, {}, keys, "mailto:a@b.c", busy)).toBe("failed");
	});
});
