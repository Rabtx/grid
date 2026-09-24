/** "My App_v2" → "my-app-v2": what the API accepts as a project slug. */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 64);
}
