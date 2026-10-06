import { describe, expect, it } from "bun:test";

import { HTTP_IDLE_SECONDS } from "./server";

describe("HTTP idle timeout", () => {
	it("outlasts Bun's 10 second default, within the 255 seconds Bun accepts", () => {
		// A GitHub list or a connector's first handshake can take longer than 10 seconds. With the
		// default, Bun reset the connection and the console reported the runner as not running.
		expect(HTTP_IDLE_SECONDS).toBeGreaterThan(10);
		expect(HTTP_IDLE_SECONDS).toBeLessThanOrEqual(255);
	});
});
