import type { Metadata } from "next";
import {
	HeroSection,
	InstallSection,
	PrinciplesSection,
	SITE,
	SiteFooter,
	SiteHeader,
	StatusSection,
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
				<PrinciplesSection />
				<StatusSection />
				<InstallSection />
			</main>
			<SiteFooter />
		</div>
	);
}
