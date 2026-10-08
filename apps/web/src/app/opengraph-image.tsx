import { ImageResponse } from "next/og";
import { BRAND_BLUE } from "@/components/brand";
import { MARK_ACCENT, MARK_INK } from "@/components/brand/brand-paths";
import { SITE } from "@/modules/landing";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";

export default function OpengraphImage() {
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				backgroundColor: "#141414",
				color: "#ffffff",
				padding: 72,
				fontFamily: "sans-serif",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 32 }}>
				<svg width={144} height={144} viewBox="0 0 64 64">
					<path fillRule="evenodd" clipRule="evenodd" d={MARK_INK} fill="#ffffff" />
					<path fillRule="evenodd" clipRule="evenodd" d={MARK_ACCENT} fill={BRAND_BLUE} />
				</svg>
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					<div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1 }}>{SITE.name}</div>
					<div
						style={{
							fontSize: 28,
							color: "#a3a3a3",
							lineHeight: 1.35,
							maxWidth: 860,
						}}
					>
						{SITE.tagline}
					</div>
				</div>
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					fontSize: 24,
					color: "#a3a3a3",
				}}
			>
				<div
					style={{
						display: "flex",
						textTransform: "uppercase",
						letterSpacing: "0.2em",
					}}
				>
					Open source · early
				</div>
				<div style={{ display: "flex" }}>github.com/shabirkhan-dev/grid</div>
			</div>
		</div>,
		{
			...size,
		},
	);
}
