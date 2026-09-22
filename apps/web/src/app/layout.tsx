import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { themeInitScript } from "@/components/theme";
import { SITE } from "@/modules/landing";
import { SITE_URL } from "./site";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});

const description =
	"AI-native operating system for building and running a startup — projects, agents, development, deployment and operations in one control plane.";

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: SITE.name,
		template: `%s | ${SITE.name}`,
	},
	description,
	applicationName: SITE.name,
	openGraph: {
		type: "website",
		locale: "en_US",
		siteName: SITE.name,
		title: SITE.name,
		description,
	},
	twitter: {
		card: "summary_large_image",
		title: SITE.name,
		description,
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={inter.variable} suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static FOUC bootstrap, not user input */}
				<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
			</head>
			<body className="font-sans antialiased" suppressHydrationWarning>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
