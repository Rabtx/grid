import type { Metadata } from "next";
import {
	AgentsSection,
	FeaturesSection,
	HeroSection,
	InstallSection,
	PrinciplesSection,
	SITE,
	SiteFooter,
	SiteHeader,
} from "@/modules/landing";

export const metadata: Metadata = {
	alternates: {
		canonical: "/",
	},
	openGraph: {
		url: "/",
		title: `${SITE.name} — ${SITE.tagline}`,
		description: SITE.summary,
	},
	twitter: {
		card: "summary_large_image",
		title: `${SITE.name} — ${SITE.tagline}`,
		description: SITE.summary,
	},
};

export default function Page() {
	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<main className="flex-1">
				<HeroSection />
				<FeaturesSection />
				<AgentsSection />
				<InstallSection />
				<PrinciplesSection />
			</main>
			<SiteFooter />
		</div>
	);
}
