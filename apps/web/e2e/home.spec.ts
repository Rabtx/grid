import { expect, test } from "@playwright/test";

test("home page says what grid is and offers both installs", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { level: 1, name: /A workspace for you and your coding agents/i }),
	).toBeVisible();

	const panel = page.getByRole("tabpanel");
	await expect(panel).toContainText(/curl -fsSL \S+\/install\.sh \| bash$/);
	await page.getByRole("tab", { name: "Runner only" }).click();
	await expect(panel).toContainText("| bash -s -- runner");
});

test("the installer is served as a shell script", async ({ request }) => {
	const response = await request.get("/install.sh");
	expect(response.ok()).toBe(true);
	expect(response.headers()["content-type"]).toContain("shellscript");
	expect(await response.text()).toMatch(/^#!\/usr\/bin\/env bash/);
});
