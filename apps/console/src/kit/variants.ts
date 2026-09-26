/**
 * One way to give a component its options. A recipe names a base, a few axes (size, tone,
 * variant…) and their defaults; calling it with props gives the class string. Every kit component
 * builds its classes this way, so adding a size or a tone is one entry in one place.
 *
 *   const button = variants({
 *     base: "inline-flex items-center",
 *     variants: { size: { sm: "h-7", md: "h-8" }, tone: { primary: "…", ghost: "…" } },
 *     defaults: { size: "md", tone: "ghost" },
 *   });
 *   button({ size: "sm" }) // "inline-flex items-center h-7 …"
 */
type Axes = Record<string, Record<string, string>>;

export type VariantProps<A extends Axes> = { [K in keyof A]?: keyof A[K] };

export function variants<const A extends Axes>(recipe: {
	base: string;
	variants: A;
	defaults: { [K in keyof A]: keyof A[K] };
}): (props?: VariantProps<A> & { class?: unknown }) => string {
	return (props = {}) => {
		const parts = [recipe.base];
		for (const axis of Object.keys(recipe.variants) as (keyof A)[]) {
			const choice = (props[axis] ?? recipe.defaults[axis]) as string;
			const value = recipe.variants[axis][choice];
			if (value) parts.push(value);
		}
		// Extra classes (layout, from the caller) go last; JSX may pass a non-string here.
		if (typeof props.class === "string" && props.class) parts.push(props.class);
		return parts.join(" ");
	};
}
