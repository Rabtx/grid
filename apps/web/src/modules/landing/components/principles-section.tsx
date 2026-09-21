import { NOT_LIST, PRINCIPLES } from "../data/landing.data";

export function PrinciplesSection() {
	return (
		<section className="border-border/60 border-b">
			<div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
				<h2 className="font-semibold text-2xl tracking-tight">What makes it Grid</h2>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
					Four constraints decide every design call. They are the reason Grid is an operating layer
					rather than one more tool to keep open in a tab.
				</p>

				<dl className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
					{PRINCIPLES.map((principle) => (
						<div key={principle.id} className="min-w-0">
							<dt className="font-medium text-sm">{principle.title}</dt>
							<dd className="mt-1.5 text-muted-foreground text-sm leading-6">{principle.body}</dd>
						</div>
					))}
				</dl>

				<div className="mt-12 rounded-lg border border-border bg-card px-5 py-4">
					<p className="text-sm leading-6">
						<span className="text-muted-foreground">Grid is not </span>
						{NOT_LIST.map((item, index) => (
							<span key={item}>
								<span className="text-muted-foreground line-through decoration-border">{item}</span>
								<span className="text-muted-foreground">
									{index < NOT_LIST.length - 1 ? ", " : ". "}
								</span>
							</span>
						))}
						<span>
							Those are capabilities inside it. Grid is the environment that connects them.
						</span>
					</p>
				</div>
			</div>
		</section>
	);
}
