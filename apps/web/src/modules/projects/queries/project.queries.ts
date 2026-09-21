export const projectQueryKeys = {
	all: ["projects"] as const,
	list: () => [...projectQueryKeys.all, "list"] as const,
	detail: (slug: string) => [...projectQueryKeys.all, "detail", slug] as const,
	tasks: (slug: string) => [...projectQueryKeys.all, "tasks", slug] as const,
};
