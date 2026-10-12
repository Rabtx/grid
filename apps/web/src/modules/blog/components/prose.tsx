import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

/** Long-form text pieces for a post, so every post shares one reading rhythm. */

export function PostH2({ id, children }: { id: string; children: React.ReactNode }) {
	return (
		<h2
			id={id}
			className="mt-16 scroll-mt-20 text-balance font-semibold text-2xl tracking-[-0.02em] first:mt-0 sm:text-[28px] sm:leading-9"
		>
			{children}
		</h2>
	);
}

export function PostH3({ children }: { children: React.ReactNode }) {
	return <h3 className="mt-8 font-semibold text-[17px] leading-7">{children}</h3>;
}

export function PostP({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<p className={cn("mt-4 text-[16px] text-foreground/85 leading-7 sm:text-[17px]", className)}>
			{children}
		</p>
	);
}

export function PostList({ items }: { items: readonly React.ReactNode[] }) {
	return (
		<ul className="mt-4 space-y-2 text-[16px] text-foreground/85 leading-7 sm:text-[17px]">
			{items.map((item, index) => (
				// Static copy that never reorders, so the position is a stable key.
				// oxlint-disable-next-line react/no-array-index-key
				<li key={index} className="relative pl-5">
					<span
						aria-hidden
						className="absolute top-[0.7em] left-0 size-1.5 rounded-full bg-foreground/35"
					/>
					{item}
				</li>
			))}
		</ul>
	);
}

/** A numbered tip with its icon: the post's main repeated unit. */
export function PostTip({
	index,
	icon,
	title,
	children,
}: {
	index: number;
	icon: IconSvgElement;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<li className="flex gap-4 border-border border-t pt-6">
			<span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground/80">
				<HugeiconsIcon icon={icon} className="size-5" strokeWidth={1.5} />
			</span>
			<div className="min-w-0">
				<h3 className="font-semibold text-[16px] leading-6 sm:text-[17px]">
					<span className="mr-2 font-mono text-muted-foreground text-xs tabular-nums">
						{String(index).padStart(2, "0")}
					</span>
					{title}
				</h3>
				<div className="mt-1.5 text-[15px] text-muted-foreground leading-6 sm:text-[16px] sm:leading-7">
					{children}
				</div>
			</div>
		</li>
	);
}

export function PostCode({ children }: { children: React.ReactNode }) {
	return (
		<code className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
			{children}
		</code>
	);
}
