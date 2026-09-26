import { serviceUnavailable } from "../../http/errors";

import { magicLinkEmail, passwordResetEmail, verificationEmail } from "./templates";

export type EmailMessage = { to: string; subject: string; html: string };

/** Sends one email. Without a Resend key nothing is sent (codes are shown in development). */
export type EmailSender = (message: EmailMessage) => Promise<void>;

export function resendSender(options: { apiKey?: string; from: string }): EmailSender {
	return async ({ to, subject, html }) => {
		if (!options.apiKey) return;
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ from: options.from, to: [to], subject, html }),
		});
		if (!response.ok) {
			const error = (await response.json().catch(() => null)) as {
				name?: unknown;
				message?: unknown;
			} | null;
			console.warn(
				`Resend rejected an email request: status=${response.status} code=${typeof error?.name === "string" ? error.name : "unknown"} message=${typeof error?.message === "string" ? error.message : "none"}`,
			);
			throw serviceUnavailable({
				code: "EMAIL_DELIVERY_FAILED",
				message: deliveryFailureMessage(response.status),
			});
		}
	};
}

function deliveryFailureMessage(status: number): string {
	if (status === 401) return "The email provider rejected the configured API key.";
	if (status === 403 || status === 422) {
		return "The email sender is not authorized. Verify the AUTH_EMAIL_FROM domain in Resend.";
	}
	if (status === 429)
		return "Email delivery is temporarily rate limited. Please try again shortly.";
	return "The email could not be delivered. Please try again.";
}

export const sendVerificationCode = (send: EmailSender, to: string, code: string) =>
	send({ to, ...verificationEmail(code) });
export const sendPasswordResetCode = (send: EmailSender, to: string, code: string) =>
	send({ to, ...passwordResetEmail(code) });
export const sendMagicLink = (send: EmailSender, to: string, url: string) =>
	send({ to, ...magicLinkEmail(url) });
