import { FEATURES } from "../data/landing.data";
import { SectionHeading } from "./section-heading";

export function FeaturesSection() {
	return (
		<section id="features" className="scroll-mt-16 px-4 py-24 sm:px-6 sm:py-32">
			<div className="mx-auto max-w-[1088px]">
				<SectionHeading label="What's in it" title="Everything a project needs, in one place." />
				{/* Hairlines between cells come from the 1px gap over the border colour. */}
				<ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
					{FEATURES.map((feature) => (
						<li key={feature.id} className="bg-background p-6 sm:p-8">
							<h3 className="font-semibold text-[15px]">{feature.title}</h3>
							<p className="mt-2 text-[15px] text-muted-foreground leading-6">{feature.body}</p>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
