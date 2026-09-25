import { describe, expect, it } from "vitest";

import { draftsStore, taskDraft } from "./drafts";

describe("taskDraft", () => {
	it("builds seed text with title only when description and branch are absent", () => {
		const text = taskDraft({ title: "Add payment gateway integration" });
		expect(text).toBe("Add payment gateway integration");
	});

	it("builds seed text with title and description when branch is absent", () => {
		const text = taskDraft({
			title: "Add payment gateway integration",
			description: "Implement Stripe webhook handler and signature verification.",
		});
		expect(text).toBe(
			"Add payment gateway integration\n\nImplement Stripe webhook handler and signature verification.",
		);
	});

	it("builds seed text with title and branch when description is absent", () => {
		const text = taskDraft({
			title: "Add payment gateway integration",
			branch: "agent/payments/stripe-webhook",
		});
		expect(text).toBe(
			"Add payment gateway integration\n\nWork on branch agent/payments/stripe-webhook",
		);
	});

	it("builds seed text with title, markdown description, and branch", () => {
		const description = [
			"### Context",
			"We need support for webhook retries.",
			"",
			"- verify idempotency keys",
			"- log failures to database",
		].join("\n");

		const text = taskDraft({
			title: "Add payment gateway integration",
			description,
			branch: "agent/payments/stripe-webhook",
		});

		expect(text).toBe(
			`Add payment gateway integration\n\n${description}\n\nWork on branch agent/payments/stripe-webhook`,
		);
	});

	it("trims whitespace and ignores empty or blank description and branch", () => {
		const text = taskDraft({
			title: "  Fix layout bug  ",
			description: "   ",
			branch: "   ",
		});
		expect(text).toBe("Fix layout bug");
	});
});

describe("draftsStore", () => {
	it("stores and takes a draft once per project", () => {
		draftsStore.set("project-a", "Initial message for project A");
		draftsStore.set("project-b", "Initial message for project B");

		expect(draftsStore.take("project-a")).toBe("Initial message for project A");
		expect(draftsStore.take("project-a")).toBeUndefined();

		expect(draftsStore.take("project-b")).toBe("Initial message for project B");
		expect(draftsStore.take("project-b")).toBeUndefined();
	});

	it("returns undefined for projects with no draft", () => {
		expect(draftsStore.take("non-existent-project")).toBeUndefined();
	});
});
