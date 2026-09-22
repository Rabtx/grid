import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/modules/landing";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = {
	width: 1200,
	height: 630,
};
export const contentType = "image/png";

export default async function OpengraphImage() {
	const mark = await readFile(join(process.cwd(), "public/brand/grid-mark.png"));
	const markSrc = `data:image/png;base64,${mark.toString("base64")}`;

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
				{/* oxlint-disable-next-line nextjs/no-img-element -- ImageResponse asset buffer, not an HTML img */}
				<img src={markSrc} width={144} height={144} alt="" />
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
