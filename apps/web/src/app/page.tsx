import {
	HeroSection,
	InstallSection,
	PrinciplesSection,
	SiteFooter,
	SiteHeader,
	StatusSection,
} from "@/modules/landing";

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
