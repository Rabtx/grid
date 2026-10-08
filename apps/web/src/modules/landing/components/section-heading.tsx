import { cn } from "@/lib/utils";

/** A section's small label, title and optional line under it, left-aligned. */
export function SectionHeading({
	label,
	title,
	children,
	className,
}: {
	label: string;
	title: string;
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("max-w-2xl", className)}>
			<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.18em]">{label}</p>
			<h2 className="mt-3 text-balance font-semibold text-3xl tracking-[-0.03em] sm:text-4xl">
				{title}
			</h2>
			{children ? (
				<p className="mt-3 text-[16px] text-muted-foreground leading-7">{children}</p>
			) : null}
		</div>
	);
}
