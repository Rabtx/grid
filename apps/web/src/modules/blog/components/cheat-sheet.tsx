import { Bookmark02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CHEAT_SHEET, CHEAT_SHEET_ROWS, type CheatSheetRow } from "../data/cheat-sheet.data";
import { SpecSwitch } from "./spec-switch";

const { type, button, rows, badge, text } = CHEAT_SHEET;

function Badge({ children }: { children: React.ReactNode }) {
	return (
		<span
			className="inline-flex items-center px-2 font-medium text-[12px]"
			style={{
				height: badge.height,
				borderRadius: badge.radius,
				backgroundColor: badge.fill,
				color: badge.text,
			}}
		>
			{children}
		</span>
	);
}

/** Each row's specimen, drawn from the same numbers its spec line prints. */
function Specimen({ id }: { id: CheatSheetRow["id"] }) {
	switch (id) {
		case "type":
			return (
				<div className="space-y-1">
					<p className="font-medium" style={{ fontSize: type.title.sizes[1], lineHeight: 1.3 }}>
						Settings
					</p>
					<p className="font-medium" style={{ fontSize: type.title.sizes[0], lineHeight: 1.4 }}>
						Notifications
					</p>
					<p className="font-medium" style={{ fontSize: type.label.sizes[0] }}>
						Email digest
					</p>
					<p style={{ fontSize: type.body.size, color: text.subtle }}>
						A summary of what your agents shipped.
					</p>
				</div>
			);
		case "buttons":
			return (
				<div className="flex flex-wrap gap-2">
					{(["Save", "Cancel"] as const).map((label, index) => (
						<span
							key={label}
							className="inline-flex items-center px-3.5 font-medium text-[13px]"
							style={{
								height: button.height,
								borderRadius: button.radius,
								...(index === 0
									? { backgroundColor: text.default, color: "#FFFFFF" }
									: { boxShadow: "inset 0 0 0 1px #E5E5E5", color: text.default }),
							}}
						>
							{label}
						</span>
					))}
				</div>
			);
		case "rows":
			return (
				<div className="w-full divide-y divide-[#EEEEEE] overflow-hidden rounded-[10px] border border-[#EEEEEE]">
					<div
						className="flex items-center justify-between px-3 text-[13px]"
						style={{ height: rows.data }}
					>
						<span className="font-mono">feat/billing</span>
						<span style={{ color: text.subtle }}>2m ago · {rows.data}px</span>
					</div>
					<div
						className="flex items-center justify-between px-3 text-[13px]"
						style={{ height: rows.stores }}
					>
						<span className="font-medium">App Store</span>
						<span style={{ color: text.subtle }}>{rows.stores}px</span>
					</div>
				</div>
			);
		case "badge":
			return <Badge>Active</Badge>;
		case "switch":
			return (
				<div className="flex items-center gap-3">
					<SpecSwitch label="Example switch" />
					<span className="text-[13px]" style={{ color: text.subtle }}>
						Tap it
					</span>
				</div>
			);
		case "text":
			return (
				<div className="space-y-0.5 text-[14px]">
					<p style={{ color: text.default }}>Default {text.default}</p>
					<p style={{ color: text.subtle }}>Subtle {text.subtle}</p>
				</div>
			);
	}
}

/** One settings panel built from nothing but the sheet, to show the parts working together. */
function SettingsPanel() {
	const items = [
		{ id: "digest", label: "Email digest", hint: "Daily at 9:00", state: "on" },
		{ id: "reviews", label: "Review requests", hint: "When an agent opens a PR", state: "on" },
		{ id: "deploys", label: "Deploys", hint: "Production only", state: "badge" },
	] as const;
	return (
		<div className="rounded-[14px] border border-[#EEEEEE] bg-white p-4 sm:p-5">
			<p className="font-medium" style={{ fontSize: type.title.sizes[0] }}>
				Notifications
			</p>
			<ul className="mt-3 divide-y divide-[#EEEEEE]">
				{items.map((item) => (
					<li
						key={item.id}
						className="flex items-center justify-between gap-4"
						style={{ minHeight: rows.stores }}
					>
						<div className="min-w-0 py-1.5">
							<p className="truncate font-medium" style={{ fontSize: type.label.sizes[0] }}>
								{item.label}
							</p>
							<p className="truncate text-[12px]" style={{ color: text.subtle }}>
								{item.hint}
							</p>
						</div>
						{item.state === "badge" ? <Badge>Active</Badge> : <SpecSwitch label={item.label} />}
					</li>
				))}
			</ul>
		</div>
	);
}

/**
 * The app UI cheat sheet as a bookmarkable card. The specimens sit on a fixed white sheet in
 * both site themes because the numbers are a light-mode spec.
 */
export function CheatSheet() {
	return (
		<section
			id="cheat-sheet"
			aria-labelledby="cheat-sheet-title"
			className="not-prose scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-[#F5F5F5] text-[#333333]"
		>
			<header className="flex items-start gap-3 border-[#E5E5E5] border-b bg-white px-4 py-4 sm:px-6">
				<span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#0077E6]/10 text-[#0077E6]">
					<HugeiconsIcon icon={Bookmark02Icon} className="size-4" strokeWidth={1.5} />
				</span>
				<div className="min-w-0">
					<h2 id="cheat-sheet-title" className="font-semibold text-[17px] leading-6">
						Apps design UI cheat sheet
					</h2>
					<p className="text-[13px] text-[#777777]">Bookmark this. Every number below is live.</p>
				</div>
			</header>
			<ul className="divide-y divide-[#E5E5E5] bg-white">
				{CHEAT_SHEET_ROWS.map((row) => (
					<li
						key={row.id}
						className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] sm:items-center sm:gap-6 sm:px-6"
					>
						<div className="min-w-0">
							<h3 className="font-medium text-[13px] text-[#777777] uppercase tracking-[0.08em]">
								{row.label}
							</h3>
							<p className="mt-1 text-[15px] leading-6">{row.spec}</p>
						</div>
						<div className="flex min-w-0 items-center">
							<Specimen id={row.id} />
						</div>
					</li>
				))}
			</ul>
			<div className="space-y-3 px-4 py-5 sm:px-6">
				<p className="font-medium text-[15px]">Strong states make settings easier to scan.</p>
				<SettingsPanel />
			</div>
		</section>
	);
}
