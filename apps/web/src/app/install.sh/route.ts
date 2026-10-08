import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * `curl -fsSL <site>/install.sh | bash`: the repository's installer (scripts/bash/install.sh),
 * read once at build time, so the site always serves the script of the commit it was built from.
 */
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
	const script = await readFile(join(process.cwd(), "../../scripts/bash/install.sh"), "utf8");
	return new Response(script, {
		headers: {
			"content-type": "text/x-shellscript; charset=utf-8",
			"cache-control": "public, max-age=300",
		},
	});
}
