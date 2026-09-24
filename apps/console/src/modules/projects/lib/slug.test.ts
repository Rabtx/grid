import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
	it("turns a folder name into a slug the API accepts", () => {
		expect(slugify("My App_v2")).toBe("my-app-v2");
		expect(slugify("  Grid  ")).toBe("grid");
		expect(slugify("Café Menu!")).toBe("cafe-menu");
		expect(slugify("--weird--name--")).toBe("weird-name");
	});
});
