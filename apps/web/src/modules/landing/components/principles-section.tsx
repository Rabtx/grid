import { PRINCIPLES } from "../data/landing.data";
import { SectionHeading } from "./section-heading";

export function PrinciplesSection() {
	return (
		<section className="border-border/60 border-t px-4 py-24 sm:px-6 sm:py-32">
			<div className="mx-auto max-w-[1088px]">
				<SectionHeading label="Principles" title="Built to stay yours." />
				<dl className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
					{PRINCIPLES.map((principle) => (
						<div key={principle.id} className="border-border border-t pt-5">
							<dt className="font-semibold text-[15px]">{principle.title}</dt>
							<dd className="mt-2 text-[15px] text-muted-foreground leading-6">{principle.body}</dd>
						</div>
					))}
				</dl>
			</div>
		</section>
	);
}
