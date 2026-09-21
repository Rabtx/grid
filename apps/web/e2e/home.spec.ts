import { expect, test } from "@playwright/test";

test("home page renders the grid definition heading", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", {
			name: /An AI-native operating system for building and running a startup/i,
		}),
	).toBeVisible();
});
