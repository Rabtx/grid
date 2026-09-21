import { STATUS } from "../data/landing.data";

export function StatusSection() {
	return (
		<section className="border-border/60 border-b">
			<div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
				<h2 className="font-semibold text-2xl tracking-tight">{STATUS.heading}</h2>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">{STATUS.body}</p>

				<div className="mt-8 grid gap-6 sm:grid-cols-2">
					<StatusList
						label="Working today"
						items={STATUS.shipped}
						marker="●"
						markerClassName="text-foreground"
					/>
					<StatusList
						label="Defined, not built"
						items={STATUS.next}
						marker="○"
						markerClassName="text-muted-foreground"
					/>
				</div>
			</div>
		</section>
	);
}

function StatusList({
	label,
	items,
	marker,
	markerClassName,
}: {
	label: string;
	items: readonly string[];
	marker: string;
	markerClassName: string;
}) {
	return (
		<div className="min-w-0 rounded-lg border border-border bg-card px-5 py-4">
			<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
				{label}
			</p>
			<ul className="mt-3 space-y-1.5">
				{items.map((item) => (
					<li key={item} className="flex items-baseline gap-2 text-sm">
						<span aria-hidden className={`text-[8px] ${markerClassName}`}>
							{marker}
						</span>
						<span className="text-muted-foreground">{item}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
