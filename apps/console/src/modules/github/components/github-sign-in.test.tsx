import { render } from "@solidjs/web";
import { afterEach, describe, expect, it } from "vitest";

import type { GitHubStatus } from "@/modules/environments/services/github.service";

import { GitHubSignIn } from "./github-sign-in";

const missing: GitHubStatus = {
	installed: false,
	login: null,
	canManageCodespaces: false,
	claimedBy: null,
	pending: null,
	error: null,
};

describe("GitHubSignIn", () => {
	let dispose = () => {};
	afterEach(() => {
		dispose();
		document.body.replaceChildren();
	});

	function mount(props: Partial<Parameters<typeof GitHubSignIn>[0]>): HTMLElement {
		const host = document.createElement("div");
		document.body.append(host);
		dispose = render(
			() => (
				<GitHubSignIn
					status={missing}
					busy={false}
					purpose="to connect GitHub"
					onSignIn={() => {}}
					{...props}
				/>
			),
			host,
		);
		return host;
	}

	it("offers to install the GitHub CLI when it is missing, without a terminal", () => {
		let installed = 0;
		const host = mount({ onInstall: () => installed++ });
		const button = [...host.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("Install GitHub CLI"),
		);
		expect(button).toBeDefined();
		button?.click();
		expect(installed).toBe(1);
	});

	it("shows the sign-in once it is installed", () => {
		const host = mount({ status: { ...missing, installed: true }, onInstall: () => {} });
		expect(host.textContent).toContain("Sign in with GitHub");
		expect(host.textContent).not.toContain("Install GitHub CLI");
	});

	it("says why an install failed", () => {
		const host = mount({
			status: { ...missing, error: "Could not download the GitHub CLI (503)" },
			onInstall: () => {},
		});
		expect(host.textContent).toContain("Could not download the GitHub CLI (503)");
	});
});
