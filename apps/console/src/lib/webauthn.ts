/**
 * The browser half of a passkey sign-in. The API sends WebAuthn options as JSON (base64url
 * strings, as @simplewebauthn makes them); the browser wants ArrayBuffers in and gives them back
 * out. These turn one into the other without a library.
 */

function fromBase64Url(value: string): ArrayBuffer {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
	return bytes.buffer;
}

function toBase64Url(buffer: ArrayBuffer): string {
	let binary = "";
	for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The request options as the API sends them. */
export type PasskeyRequestJSON = {
	challenge: string;
	rpId?: string;
	timeout?: number;
	userVerification?: UserVerificationRequirement;
	allowCredentials?: { id: string; type?: string; transports?: string[] }[];
};

/** Whether this browser can sign in with a passkey at all. */
export function passkeysSupported(): boolean {
	return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

/**
 * Asks the browser (and the person's device) for a passkey assertion, and returns it in the JSON
 * shape the API verifies. Throws a readable error when the person cancels or there is none.
 */
export async function getPasskeyAssertion(
	options: PasskeyRequestJSON,
): Promise<Record<string, unknown>> {
	let credential: Credential | null;
	try {
		credential = await navigator.credentials.get({
			publicKey: {
				challenge: fromBase64Url(options.challenge),
				rpId: options.rpId,
				timeout: options.timeout,
				userVerification: options.userVerification,
				allowCredentials: options.allowCredentials?.map((allowed) => ({
					id: fromBase64Url(allowed.id),
					type: "public-key",
					transports: allowed.transports as AuthenticatorTransport[] | undefined,
				})),
			},
		});
	} catch (cause) {
		// The person closed the prompt, or the device has no passkey for this site.
		if (cause instanceof DOMException && cause.name === "NotAllowedError") {
			throw new Error("No passkey was used. Try again, or continue with your email.");
		}
		throw cause;
	}
	if (!(credential instanceof PublicKeyCredential)) {
		throw new Error("No passkey was used. Try again, or continue with your email.");
	}
	const response = credential.response as AuthenticatorAssertionResponse;
	return {
		id: credential.id,
		rawId: toBase64Url(credential.rawId),
		type: credential.type,
		authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
		clientExtensionResults: credential.getClientExtensionResults(),
		response: {
			clientDataJSON: toBase64Url(response.clientDataJSON),
			authenticatorData: toBase64Url(response.authenticatorData),
			signature: toBase64Url(response.signature),
			userHandle: response.userHandle ? toBase64Url(response.userHandle) : undefined,
		},
	};
}

/** The creation options as the API sends them (from @simplewebauthn's registration options). */
type PasskeyCreationJSON = {
	challenge: string;
	rp: { id?: string; name: string };
	user: { id: string; name: string; displayName: string };
	pubKeyCredParams: { type: "public-key"; alg: number }[];
	timeout?: number;
	excludeCredentials?: { id: string; type?: string; transports?: string[] }[];
	authenticatorSelection?: AuthenticatorSelectionCriteria;
	attestation?: AttestationConveyancePreference;
};

/**
 * Asks the person's device to make a passkey for this account, and returns it in the JSON shape
 * the API registers. Throws a readable error when the person cancels.
 */
export async function createPasskey(
	raw: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const options = raw as unknown as PasskeyCreationJSON;
	let credential: Credential | null;
	try {
		credential = await navigator.credentials.create({
			publicKey: {
				challenge: fromBase64Url(options.challenge),
				rp: options.rp,
				user: {
					id: fromBase64Url(options.user.id),
					name: options.user.name,
					displayName: options.user.displayName,
				},
				pubKeyCredParams: options.pubKeyCredParams,
				timeout: options.timeout,
				excludeCredentials: options.excludeCredentials?.map((existing) => ({
					id: fromBase64Url(existing.id),
					type: "public-key",
					transports: existing.transports as AuthenticatorTransport[] | undefined,
				})),
				authenticatorSelection: options.authenticatorSelection,
				attestation: options.attestation,
			},
		});
	} catch (cause) {
		if (cause instanceof DOMException && cause.name === "NotAllowedError")
			throw new Error("No passkey was made.");
		if (cause instanceof DOMException && cause.name === "InvalidStateError")
			throw new Error("This device already has a passkey for your account.");
		throw cause;
	}
	if (!(credential instanceof PublicKeyCredential)) throw new Error("No passkey was made.");
	const response = credential.response as AuthenticatorAttestationResponse;
	return {
		id: credential.id,
		rawId: toBase64Url(credential.rawId),
		type: credential.type,
		authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
		clientExtensionResults: credential.getClientExtensionResults(),
		response: {
			clientDataJSON: toBase64Url(response.clientDataJSON),
			attestationObject: toBase64Url(response.attestationObject),
			transports: response.getTransports?.() ?? [],
		},
	};
}
