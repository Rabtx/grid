import { describe, expect, it } from "vitest";

import { insideFolder } from "./paths";
import { previewUrl } from "./preview";

describe("previewUrl", () => {
	it("uses the host Grid was opened on, so a phone on the network reaches the same machine", () => {
		expect(previewUrl({ protocol: "http:", hostname: "192.168.1.20" }, 5173)).toEqual({
			href: "http://192.168.1.20:5173/",
			host: "192.168.1.20:5173",
			frameable: true,
		});
	});

	it("brackets an IPv6 host once", () => {
		expect(previewUrl({ protocol: "http:", hostname: "[::1]" }, 3000).host).toBe("[::1]:3000");
		expect(previewUrl({ protocol: "http:", hostname: "::1" }, 3000).host).toBe("[::1]:3000");
	});

	it("will not frame plain http inside an https Grid, which the browser would block", () => {
		expect(previewUrl({ protocol: "https:", hostname: "grid.example" }, 5173).frameable).toBe(
			false,
		);
	});
});

describe("insideFolder", () => {
	it("takes the folder off a path inside it", () => {
		expect(insideFolder("/home/me/shop", "/home/me/shop/src/app.ts")).toBe("src/app.ts");
		expect(insideFolder("/home/me/shop/", "/home/me/shop/a.ts")).toBe("a.ts");
	});

	it("keeps a relative path as it is", () => {
		expect(insideFolder("/home/me/shop", "./src/app.ts")).toBe("src/app.ts");
	});

	it("refuses a path elsewhere, including a sibling that only shares a prefix", () => {
		expect(insideFolder("/home/me/shop", "/home/me/shopping/a.ts")).toBeNull();
		expect(insideFolder("/home/me/shop", "/etc/passwd")).toBeNull();
		expect(insideFolder("/home/me/shop", "/home/me/shop")).toBeNull();
	});
});
