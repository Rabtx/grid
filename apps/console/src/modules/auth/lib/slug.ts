/** A workspace name as a URL slug: `Acme Inc.` → `acme-inc`. */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

/** While typing a slug: lowercase, and anything else becomes a dash (trimmed by the API check). */
export const slugInput = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.slice(0, 64);
