import type { Database } from "@grid/db";
import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppEnv } from "../../http/context";
import { ok } from "../../http/respond";
import { body } from "../../http/validate";
import { createCheckoutSchema, createPortalSchema } from "./dto";
import {
	createCheckout,
	createPortal,
	getSubscription,
	handleWebhook,
	listConfiguredProviders,
} from "./service";

export type BillingDeps = {
	db?: Database;
	sessions: SessionLookup;
};

export function billingRoutes(deps: BillingDeps): Hono<AppEnv> {
	const router = new Hono<AppEnv>();

	router.get("/providers", (c) => {
		const providers = listConfiguredProviders(c.get("config"));
		return ok(c, { providers });
	});

	router.get("/subscription", requireUser(deps.sessions), async (c) => {
		const user = c.get("user");
		const db = getDb(deps.db);
		const subscription = await getSubscription(db, user.sub);
		return ok(c, { subscription });
	});

	router.post("/checkout", requireUser(deps.sessions), async (c) => {
		const user = c.get("user");
		const input = await body(c.req, createCheckoutSchema);
		const db = getDb(deps.db);
		const result = await createCheckout(db, c.get("config"), user.sub, input);
		return ok(c, result);
	});

	router.post("/portal", requireUser(deps.sessions), async (c) => {
		const user = c.get("user");
		const input = await body(c.req, createPortalSchema);
		const db = getDb(deps.db);
		const result = await createPortal(db, c.get("config"), user.sub, input);
		return ok(c, result);
	});

	router.post("/webhooks/:provider", async (c) => {
		const provider = c.req.param("provider");
		if (provider !== "stripe" && provider !== "razorpay") {
			return ok(c, { received: false, handled: false });
		}
		const rawBody = await c.req.text();
		const db = getDb(deps.db);
		const result = await handleWebhook(db, c.get("config"), provider, rawBody, c.req.raw.headers);
		return ok(c, result);
	});

	return router;
}

function getDb(db?: Database): Database {
	if (!db) {
		throw new Error("Database dependency is required for billing operations");
	}
	return db;
}
