import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import {
	Button,
	ColorSwatches,
	notify,
	playArrival,
	Row,
	Select,
	SettingsGroup,
	SettingsRow,
	Slider,
	SparklesIcon,
	Switch,
	Text,
	ThemeCards,
} from "@/kit";
import {
	ACCENT_PRESETS,
	APPEARANCE_LIMITS,
	appearance,
	CODE_FONTS,
	type CodeFont,
	type Corners,
	type Density,
	resetAppearance,
	type SidebarStyle,
	type Theme,
	updateAppearance,
} from "@/lib/appearance";
import { clearBackdropImage, hasBackdropImage, setBackdropImage } from "@/lib/backdrop";
import { playChime } from "@/lib/chime";
import { useShell } from "@/modules/shell";

import { SettingsPage, settingsMenu } from "./settings-page";

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** A slider in a settings row, wide enough to drag on a phone and on the right on desktop. */
function RowSlider(props: {
	label: string;
	limits: { min: number; max: number; step: number };
	value: number;
	onChange: (value: number) => void;
	format: (value: number) => string;
}): JSX.Element {
	return (
		<div class="w-full md:w-64">
			<Slider
				label={props.label}
				min={props.limits.min}
				max={props.limits.max}
				step={props.limits.step}
				value={props.value}
				onChange={props.onChange}
				format={props.format}
				labelHidden
			/>
		</div>
	);
}

/** Text sizes as the interface scale they set: 13 is the design. */
const TEXT_SIZES = [
	{ value: "0.9", label: "12 · Small" },
	{ value: "1", label: "13 · Default" },
	{ value: "1.1", label: "14 · Large" },
	{ value: "1.2", label: "15 · Larger" },
	{ value: "1.3", label: "16 · Largest" },
];

const DENSITIES: readonly { value: Density; label: string }[] = [
	{ value: "compact", label: "Compact" },
	{ value: "comfortable", label: "Comfortable" },
	{ value: "spacious", label: "Spacious" },
];

/** Round is the design; soft has no pills; square has no corners, like a terminal. */
const CORNERS: readonly { value: Corners; label: string }[] = [
	{ value: "round", label: "Round" },
	{ value: "soft", label: "Soft" },
	{ value: "square", label: "Square" },
];

/**
 * Settings → Appearance (Figma 24): make Grid feel like yours, on this device. Everything applies
 * live, so the screen itself is the preview. Theme and accent first; then text and layout (size,
 * density, corners, fonts and the sidebar); the tint and surfaces; the background picture; motion
 * and sound. Saved on this device, like a zoom level.
 */
export function AppearanceScreen(): JSX.Element {
	const shell = useShell();
	let picker: HTMLInputElement | undefined;
	// Desktop rows show their value as a pill; phones as quiet text with a chevron.
	const rowLook = () => (shell.desktop() ? "pill" : "value");
	// Phones keep rows to their names, as the Figma phone frame does.
	const desktopOnly = (text: string) => (shell.desktop() ? text : undefined);
	const textSize = () => {
		const scale = String(appearance().uiScale);
		return TEXT_SIZES.some((size) => size.value === scale) ? scale : "custom";
	};
	return (
		<SettingsPage
			title="Appearance"
			description="Make Grid feel like yours. Changes apply on this device."
			subtitle="This device"
			menu={settingsMenu(
				"Appearance",
				[{ items: [{ id: "reset", label: "Restore defaults" }] }],
				() => resetAppearance(),
			)}
		>
			<section class="flex flex-col gap-2 md:gap-3">
				<div>
					<h2 class="font-medium text-body-lg text-fg max-md:px-1 max-md:font-normal max-md:text-caption max-md:text-fg-subtle">
						Theme
					</h2>
					<Text size="caption" tone="subtle" class="max-md:hidden">
						Terminals and the harness follow it too.
					</Text>
				</div>
				<ThemeCards<Theme>
					label="Theme"
					value={appearance().theme}
					onChange={(theme) => updateAppearance({ theme })}
					options={[
						{ value: "light", label: "Light", look: "light" },
						{ value: "dark", label: "Dark", look: "dark" },
						{ value: "system", label: "System", look: "split" },
					]}
				/>
			</section>

			<SettingsGroup title="Accent">
				<SettingsRow
					label="Accent color"
					description={desktopOnly(
						"Buttons, selection, links and focus. Automatic is blue with ink buttons.",
					)}
				>
					<ColorSwatches
						label="Accent color"
						labelHidden
						options={ACCENT_PRESETS}
						value={
							ACCENT_PRESETS.find((accent) => accent.value === appearance().accent)?.id ??
							appearance().accent
						}
						onChange={(id) =>
							updateAppearance({
								accent:
									id === null
										? null
										: (ACCENT_PRESETS.find((accent) => accent.id === id)?.value ?? id),
							})
						}
					/>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title="Text & layout">
				<SettingsRow
					inline
					label="Text size"
					description={desktopOnly("Zooms the interface. Ctrl+= and Ctrl+- work too (⌘ on macOS).")}
				>
					<Select
						look={rowLook()}
						label="Text size"
						value={textSize()}
						onChange={(value) => updateAppearance({ uiScale: Number(value) })}
						groups={[
							{
								options:
									textSize() === "custom"
										? [...TEXT_SIZES, { value: "custom", label: percent(appearance().uiScale) }]
										: TEXT_SIZES,
							},
						]}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Density"
					description={desktopOnly("Height of rows and controls. Touch targets stay 44px.")}
				>
					<Select<Density>
						look={rowLook()}
						label="Density"
						value={appearance().density}
						onChange={(density) => updateAppearance({ density })}
						groups={[{ options: DENSITIES }]}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Corners"
					description={desktopOnly("Round pills, softly rounded, or square like a terminal")}
				>
					<Select<Corners>
						look={rowLook()}
						label="Corners"
						value={appearance().corners}
						onChange={(corners) => updateAppearance({ corners })}
						groups={[{ options: CORNERS }]}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Code font"
					description={desktopOnly("Terminals, diffs and the harness")}
				>
					<Select<CodeFont>
						look={rowLook()}
						label="Code font"
						value={appearance().codeFont}
						onChange={(codeFont) => updateAppearance({ codeFont })}
						groups={[
							{
								options: (Object.keys(CODE_FONTS) as CodeFont[]).map((value) => ({
									value,
									label: CODE_FONTS[value].label,
								})),
							},
						]}
					/>
				</SettingsRow>
				<Show when={shell.desktop()}>
					<SettingsRow
						inline
						label="Sidebar"
						description="Down the side, or floating over the canvas"
					>
						<Select<SidebarStyle>
							look={rowLook()}
							label="Sidebar"
							value={appearance().sidebar}
							onChange={(sidebar) => updateAppearance({ sidebar })}
							groups={[
								{
									options: [
										{ value: "full", label: "Full" },
										{ value: "floating", label: "Floating" },
									],
								},
							]}
						/>
					</SettingsRow>
					<Show when={appearance().sidebar === "full"}>
						<SettingsRow inline label="Rail labels" description="Show names next to rail icons">
							<Switch
								label="Rail labels"
								checked={appearance().railLabels}
								onChange={(railLabels) => updateAppearance({ railLabels })}
							/>
						</SettingsRow>
					</Show>
				</Show>
			</SettingsGroup>

			<SettingsGroup
				title="Colour & surfaces"
				description={desktopOnly(
					"Hue and saturation tint every surface. Lightness only moves the dark theme.",
				)}
			>
				<SettingsRow label="Hue" description={desktopOnly("Base hue for tinted surfaces")}>
					<RowSlider
						label="Hue"
						limits={APPEARANCE_LIMITS.hue}
						value={appearance().hue}
						onChange={(hue) => updateAppearance({ hue })}
						format={(value) => `${value}°`}
					/>
				</SettingsRow>
				<SettingsRow
					label="Saturation"
					description={desktopOnly("How strongly the hue tints the interface. Zero is neutral.")}
				>
					<RowSlider
						label="Saturation"
						limits={APPEARANCE_LIMITS.saturation}
						value={appearance().saturation}
						onChange={(saturation) => updateAppearance({ saturation })}
						format={(value) => `${value}%`}
					/>
				</SettingsRow>
				<SettingsRow
					label="Dark-mode lightness"
					description={desktopOnly("Lower is darker; zero is true black")}
				>
					<RowSlider
						label="Dark-mode lightness"
						limits={APPEARANCE_LIMITS.darkLightness}
						value={appearance().darkLightness}
						onChange={(darkLightness) => updateAppearance({ darkLightness })}
						format={(value) => `${value}%`}
					/>
				</SettingsRow>
				<SettingsRow
					label="Line strength"
					description={desktopOnly("How visible hairlines and outlines are")}
				>
					<RowSlider
						label="Line strength"
						limits={APPEARANCE_LIMITS.lines}
						value={appearance().lines}
						onChange={(lines) => updateAppearance({ lines })}
						format={percent}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Depth"
					description={desktopOnly(
						"Light along the top edge of raised things and a lifted selection",
					)}
				>
					<Switch
						label="Depth"
						checked={appearance().depth}
						onChange={(depth) => updateAppearance({ depth })}
					/>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup
				title="Background"
				description={desktopOnly("A picture behind the sidebar, or behind the whole app")}
			>
				<SettingsRow
					inline
					label="Image"
					description={desktopOnly(
						hasBackdropImage()
							? "Kept on this device"
							: "Any photo or wallpaper; kept on this device",
					)}
				>
					<Row gap={2}>
						<input
							ref={(el) => {
								picker = el;
							}}
							type="file"
							accept="image/*"
							hidden
							aria-label="Choose a background image"
							onChange={(event) => {
								const file = event.currentTarget.files?.[0];
								event.currentTarget.value = "";
								if (!file) return;
								setBackdropImage(file).catch((cause: unknown) =>
									notify({
										title: cause instanceof Error ? cause.message : "Could not use that image",
										tone: "danger",
									}),
								);
							}}
						/>
						<Button size="sm" onClick={() => picker?.click()}>
							{hasBackdropImage() ? "Change" : "Choose image"}
						</Button>
						<Show when={hasBackdropImage()}>
							<Button size="sm" variant="ghost" onClick={() => void clearBackdropImage()}>
								Remove
							</Button>
						</Show>
					</Row>
				</SettingsRow>
				<Show when={hasBackdropImage()}>
					<SettingsRow
						inline
						label="Whole app"
						description={desktopOnly(
							appearance().backdrop === "app"
								? "Behind every screen"
								: "Off: behind the sidebar only",
						)}
					>
						<Switch
							label="Background behind the whole app"
							checked={appearance().backdrop === "app"}
							onChange={(on) => updateAppearance({ backdrop: on ? "app" : "sidebar" })}
						/>
					</SettingsRow>
					<SettingsRow
						label="Interface opacity"
						description={desktopOnly("Lower lets more of the picture through")}
					>
						<RowSlider
							label="Interface opacity"
							limits={APPEARANCE_LIMITS.backdropOpacity}
							value={appearance().backdropOpacity}
							onChange={(backdropOpacity) => updateAppearance({ backdropOpacity })}
							format={(value) => `${Math.round(value)}%`}
						/>
					</SettingsRow>
					<SettingsRow label="Blur" description={desktopOnly("Softens the picture behind text")}>
						<RowSlider
							label="Background blur"
							limits={APPEARANCE_LIMITS.backdropBlur}
							value={appearance().backdropBlur}
							onChange={(backdropBlur) => updateAppearance({ backdropBlur })}
							format={(value) => `${Math.round(value)}px`}
						/>
					</SettingsRow>
				</Show>
			</SettingsGroup>

			<SettingsGroup title="Motion & sound">
				<SettingsRow
					inline
					label="Reduce motion"
					description={desktopOnly("Fewer animations and no cursor trails")}
				>
					<Switch
						label="Reduce motion"
						checked={appearance().reduceMotion}
						onChange={(reduceMotion) => updateAppearance({ reduceMotion })}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Agent cursors"
					description={desktopOnly("See where agents point and type in Browser and Notes")}
				>
					<Switch
						label="Agent cursors"
						checked={appearance().agentCursors}
						onChange={(agentCursors) => updateAppearance({ agentCursors })}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Sounds"
					description={
						shell.desktop() ? "A soft chime when an agent needs you" : "When an agent needs you"
					}
				>
					<Button variant="ghost" size="sm" onClick={() => playChime()}>
						Play
					</Button>
					<Switch
						label="Sounds"
						checked={appearance().sounds}
						onChange={(sounds) => updateAppearance({ sounds })}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Celebrations"
					description={desktopOnly("A warp arrival when you pick a flagship model, on desktop")}
				>
					<Button
						variant="ghost"
						size="sm"
						icon={<SparklesIcon size="sm" />}
						onClick={() =>
							playArrival({
								title: "Grid",
								caption: "Celebrations look like this",
								hues: [appearance().hue, (appearance().hue + 50) % 360],
							})
						}
					>
						Try it
					</Button>
					<Switch
						label="Celebrations"
						checked={appearance().celebrations}
						onChange={(celebrations) => updateAppearance({ celebrations })}
					/>
				</SettingsRow>
			</SettingsGroup>
		</SettingsPage>
	);
}
