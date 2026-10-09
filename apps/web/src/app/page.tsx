import type { Metadata } from "next";
import { SITE_URL } from "./site";
import {
	AgentsSection,
	FeaturesSection,
	HeroSection,
	InstallSection,
	PrinciplesSection,
	SITE,
	STUDIO,
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

/** Tells search engines what Grid is and who makes it. */
const SCHEMA = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: SITE.name,
	description: SITE.summary,
	url: SITE_URL,
	applicationCategory: "DeveloperApplication",
	operatingSystem: "Linux, macOS",
	offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
	codeRepository: SITE.repoUrl,
	sameAs: [SITE.repoUrl, STUDIO.gridPage],
	publisher: { "@type": "Organization", name: STUDIO.name, url: STUDIO.url },
};

export default function Page() {
	return (
		<div className="flex min-h-dvh flex-col">
			<script
				type="application/ld+json"
				// oxlint-disable-next-line react/no-danger -- static schema built from constants, not user input
				dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }}
			/>
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
