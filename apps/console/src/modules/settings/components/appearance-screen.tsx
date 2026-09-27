import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import {
	ACCENT_PRESETS,
	APPEARANCE_LIMITS,
	appearance,
	resetAppearance,
	updateAppearance,
} from "@/lib/appearance";
import { useAuth } from "@/modules/auth";
import { Button, RestoreIcon, SegmentedControl, SignOutIcon, Slider } from "@/ui";

import { SettingsNav } from "./settings-nav";

// The presets without the leading `null`, which is the split default swatch drawn first.
const COLOR_PRESETS = ACCENT_PRESETS.filter((color): color is string => color !== null);
const CUSTOM_GRADIENT =
	"conic-gradient(from 140deg, #ef4444, #f59e0b, #10b981, #4da3f5, #8b5cf6, #ec4899, #ef4444)";

/** Settings → Appearance: theme, accent, tint, translucency and interface scale. */
export function AppearanceScreen(): JSX.Element {
	const auth = useAuth();

	return (
		<div class="mx-auto flex w-full max-w-[60rem] flex-col py-6 md:py-10">
			<SettingsNav />
			<header class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div class="min-w-0">
					{/* The tab above names the page; the heading stays for screen readers. */}
					<h1 class="sr-only">Appearance</h1>
					<p class="text-ink/50 text-ui-sm">Theme, tint, translucency and interface scale.</p>
					<p class="mt-1 text-ink/40 text-ui-xs">These settings are saved on this device.</p>
				</div>
				<Button variant="ghost" class="self-start" onClick={() => resetAppearance()}>
					<RestoreIcon class="size-4" />
					Restore defaults
				</Button>
			</header>

			<Group
				title="Theme"
				description="Dark and light share the same tint, so the colour settings below apply to both."
			>
				<Row label="Theme" description="System follows your device's appearance.">
					<SegmentedControl
						label="Theme"
						options={[
							{ value: "system", label: "System" },
							{ value: "dark", label: "Dark" },
							{ value: "light", label: "Light" },
						]}
						value={appearance().theme}
						onChange={(theme) => updateAppearance({ theme })}
					/>
				</Row>
				<Row
					label="Accent colour"
					description="Used for primary actions such as New task and Sign in."
				>
					<AccentSwatches />
				</Row>
			</Group>

			<Group
				title="Colour"
				description="Hue and saturation tint every surface. Lightness only moves the dark theme."
			>
				<Row label="Hue" description="Base hue for tinted surfaces.">
					<Slider
						label="Hue"
						{...APPEARANCE_LIMITS.hue}
						value={appearance().hue}
						onInput={(hue) => updateAppearance({ hue })}
						format={(value) => `${value}°`}
					/>
				</Row>
				<Row
					label="Saturation"
					description="How strongly the hue tints the interface. Zero keeps it neutral."
				>
					<Slider
						label="Saturation"
						{...APPEARANCE_LIMITS.saturation}
						value={appearance().saturation}
						onInput={(saturation) => updateAppearance({ saturation })}
						format={(value) => `${value}%`}
					/>
				</Row>
				<Row
					label="Dark-mode lightness"
					description="Base brightness of the dark theme. Lower is darker; zero is true black."
				>
					<Slider
						label="Dark-mode lightness"
						{...APPEARANCE_LIMITS.darkLightness}
						value={appearance().darkLightness}
						onInput={(darkLightness) => updateAppearance({ darkLightness })}
						format={(value) => `${value}%`}
					/>
				</Row>
			</Group>

			<Group
				title="Translucency"
				description="How much shows through the glass surfaces. Blur costs more to draw the higher it goes."
			>
				<Row label="Sidebar opacity" description="Applies to the sidebar and the phone top bar.">
					<Slider
						label="Sidebar opacity"
						{...APPEARANCE_LIMITS.glassOpacity}
						value={appearance().glassOpacity}
						onInput={(glassOpacity) => updateAppearance({ glassOpacity })}
						format={(value) => `${Math.round(value * 100)}%`}
					/>
				</Row>
				<Row label="Blur radius" description="Blur behind the glass surfaces.">
					<Slider
						label="Blur radius"
						{...APPEARANCE_LIMITS.glassBlur}
						value={appearance().glassBlur}
						onInput={(glassBlur) => updateAppearance({ glassBlur })}
						format={(value) => `${value}`}
					/>
				</Row>
			</Group>

			<Group title="Layout" description="Size of the interface on this device.">
				<Row
					label="Interface scale"
					description="Zoom the whole interface. You can also use Ctrl+=, Ctrl+- and Ctrl+0 (⌘ on macOS)."
				>
					<Slider
						label="Interface scale"
						{...APPEARANCE_LIMITS.uiScale}
						value={appearance().uiScale}
						onInput={(uiScale) => updateAppearance({ uiScale })}
						format={(value) => `${Math.round(value * 100)}%`}
					/>
				</Row>
			</Group>

			<Group title="Fun" description="Small moments of delight, on this device.">
				<Row
					label="Celebrations"
					description="Light up the grid when you pick a flagship model. Desktop only, and never with reduced motion."
				>
					<SegmentedControl
						label="Celebrations"
						options={[
							{ value: "on", label: "On" },
							{ value: "off", label: "Off" },
						]}
						value={appearance().celebrations ? "on" : "off"}
						onChange={(value) => updateAppearance({ celebrations: value === "on" })}
					/>
				</Row>
			</Group>

			<Group title="Account" description="Who is signed in to this console.">
				<Row label={auth.user()?.email ?? "Signed in"} description="Signing out ends this session.">
					<Button variant="secondary" onClick={() => void auth.logout()}>
						<SignOutIcon class="size-4" />
						Sign out
					</Button>
				</Row>
			</Group>
		</div>
	);
}

/** A titled block of rows, separated by hairlines inside one raised card. */
function Group(props: { title: string; description: string; children: JSX.Element }): JSX.Element {
	return (
		<section class="mt-8">
			<h2 class="font-semibold text-ui">{props.title}</h2>
			<p class="mt-0.5 mb-2 text-ink/45 text-ui-sm">{props.description}</p>
			<div class="@container divide-y divide-ink/5 rounded-xl border border-ink/10 bg-ink/3">
				{props.children}
			</div>
		</section>
	);
}

/**
 * A label on the left and its control on the right. The card is a container, so below 35rem the
 * row stacks — label above, full-width control — and from 35rem the control sits beside the label.
 */
function Row(props: { label: string; description: string; children: JSX.Element }): JSX.Element {
	return (
		<div class="flex flex-col gap-2 px-4 py-3.5 @[35rem]:flex-row @[35rem]:items-center @[35rem]:justify-between @[35rem]:gap-6">
			<div class="min-w-0">
				<p class="font-medium text-ui">{props.label}</p>
				<p class="text-ink/45 text-ui-sm">{props.description}</p>
			</div>
			<div class="flex w-full @[35rem]:w-auto @[35rem]:max-w-[60%] @[35rem]:shrink-0 @[35rem]:justify-end">
				{props.children}
			</div>
		</div>
	);
}

const SWATCH = "size-5 shrink-0 rounded-full focus-ring";
const SWATCH_SELECTED = "ring-2 ring-ink/60 ring-offset-2 ring-offset-canvas";

/** Default, the preset colours, then a native colour picker behind a custom swatch. */
function AccentSwatches(): JSX.Element {
	const accent = () => appearance().accent;
	const isPreset = (color: string) => accent() === color;
	const isCustom = () => {
		const current = accent();
		return current !== null && !COLOR_PRESETS.includes(current);
	};

	return (
		<div class="flex flex-wrap items-center gap-2.5">
			<button
				type="button"
				aria-label="Default"
				aria-pressed={accent() === null ? "true" : "false"}
				onClick={() => updateAppearance({ accent: null })}
				class={`${SWATCH} border border-ink/15 ${accent() === null ? SWATCH_SELECTED : ""}`}
				style={{
					"background-image": "linear-gradient(135deg, var(--canvas) 0 50%, var(--ink) 50% 100%)",
				}}
			/>
			<For each={COLOR_PRESETS}>
				{(color) => (
					<button
						type="button"
						aria-label={color}
						aria-pressed={isPreset(color) ? "true" : "false"}
						onClick={() => updateAppearance({ accent: color })}
						class={`${SWATCH} ${isPreset(color) ? SWATCH_SELECTED : ""}`}
						style={{ "background-color": color }}
					/>
				)}
			</For>
			<label
				class={`${SWATCH} cursor-pointer ${isCustom() ? SWATCH_SELECTED : ""}`}
				style={{ "background-image": CUSTOM_GRADIENT }}
			>
				<span class="sr-only">Custom</span>
				<input
					type="color"
					aria-label="Custom colour"
					value={accent() ?? "#4da3f5"}
					onInput={(event) => updateAppearance({ accent: event.currentTarget.value })}
					class="sr-only"
				/>
			</label>
		</div>
	);
}
