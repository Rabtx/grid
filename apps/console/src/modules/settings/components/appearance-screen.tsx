import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import {
	Badge,
	Button,
	ColorSwatches,
	Input,
	playArrival,
	Row,
	Select,
	SettingsGroup,
	SettingsRow,
	Slider,
	SparklesIcon,
	Stack,
	Switch,
	SwatchRow,
	Text,
	ThemeCards,
} from "@/kit";
import {
	ACCENT_PRESETS,
	APPEARANCE_LIMITS,
	appearance,
	CODE_FONTS,
	type CodeFont,
	type Density,
	resetAppearance,
	SIGNAL_PRESETS,
	type Theme,
	updateAppearance,
} from "@/lib/appearance";
import { playChime } from "@/lib/chime";
import { useShell } from "@/modules/shell";

import { SettingsPage, settingsMenu } from "./settings-page";

// The presets without the leading `null` (the default, which the swatches draw first).
const ACCENT_NAMES = ["Blue", "Violet", "Pink", "Red", "Amber", "Green"];
const ACCENTS = ACCENT_PRESETS.filter((color): color is string => color !== null).map(
	(value, index) => ({ id: ACCENT_NAMES[index] ?? value, value }),
);

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

/**
 * Settings → Appearance (Figma 24): make Grid feel like yours, on this device. Theme, the accent,
 * text and layout, motion and sound; then the finer controls Grid has always had — the tint every
 * surface takes, the kit's corners, spacing, lines and depth, and the button colour. Saved on this
 * device, like a zoom level.
 */
export function AppearanceScreen(): JSX.Element {
	const signal = () =>
		SIGNAL_PRESETS.find((preset) => preset.value === appearance().signal)?.id ?? "Blue";
	const shell = useShell();
	// Desktop rows show their value as a pill; phones as quiet text with a chevron.
	const rowLook = () => (shell.desktop() ? "pill" : "value");
	const swatches = (spread: boolean) => (
		<SwatchRow
			label="Accent color"
			spread={spread}
			options={SIGNAL_PRESETS}
			value={signal()}
			onChange={(id) =>
				updateAppearance({
					signal: SIGNAL_PRESETS.find((preset) => preset.id === id)?.value ?? null,
				})
			}
		/>
	);
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
			<section class="flex flex-col gap-3">
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
				<Show when={shell.desktop()} fallback={<div class="px-3 py-3">{swatches(true)}</div>}>
					<SettingsRow
						inline
						label="Accent color"
						description="Selection, links, focus and the agent cursor"
					>
						{swatches(false)}
					</SettingsRow>
				</Show>
			</SettingsGroup>

			<SettingsGroup title="Text & layout">
				<SettingsRow inline label="Text size" description="Interface text, not code">
					<Select
						look={rowLook()}
						label="Text size"
						value={textSize()}
						onChange={(value) => updateAppearance({ uiScale: Number(value) })}
						groups={[
							{
								options:
									textSize() === "custom"
										? [
												...TEXT_SIZES,
												{ value: "custom", label: `${Math.round(appearance().uiScale * 100)}%` },
											]
										: TEXT_SIZES,
							},
						]}
					/>
				</SettingsRow>
				<SettingsRow inline label="Density" description="How much room lists and boards get">
					<Select<Density>
						look={rowLook()}
						label="Density"
						value={appearance().density}
						onChange={(density) => updateAppearance({ density })}
						groups={[
							{
								options: [
									{ value: "compact", label: "Compact" },
									{ value: "comfortable", label: "Comfortable" },
									{ value: "spacious", label: "Spacious" },
								],
							},
						]}
					/>
				</SettingsRow>
				<SettingsRow inline label="Code font" description="Terminals, diffs and the harness">
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
					<SettingsRow inline label="Rail labels" description="Show names next to rail icons">
						<Switch
							label="Rail labels"
							checked={appearance().railLabels}
							onChange={(railLabels) => updateAppearance({ railLabels })}
						/>
					</SettingsRow>
				</Show>
			</SettingsGroup>

			<SettingsGroup title="Motion & sound">
				<SettingsRow
					inline
					label="Reduce motion"
					description="Fewer animations and no cursor trails"
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
					description="See where agents point and type in Browser and Notes"
				>
					<Switch
						label="Agent cursors"
						checked={appearance().agentCursors}
						onChange={(agentCursors) => updateAppearance({ agentCursors })}
					/>
				</SettingsRow>
				<SettingsRow inline label="Sounds" description="A soft chime when an agent needs you">
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
					description="A warp arrival when you pick a flagship model, on desktop"
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

			<SettingsGroup
				title="Colour"
				description="Hue and saturation tint every surface. Lightness only moves the dark theme."
			>
				<SettingsRow label="Hue" description="Base hue for tinted surfaces.">
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
					description="How strongly the hue tints the interface. Zero keeps it neutral."
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
					description="Base brightness of the dark theme. Lower is darker; zero is true black."
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
					label="Button colour"
					description="Primary actions and the celebration's glow."
				>
					<ColorSwatches
						label="Button colour"
						labelHidden
						options={ACCENTS}
						value={
							ACCENTS.find((accent) => accent.value === appearance().accent)?.id ??
							appearance().accent
						}
						onChange={(id) =>
							updateAppearance({
								accent:
									id === null ? null : (ACCENTS.find((accent) => accent.id === id)?.value ?? id),
							})
						}
					/>
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup
				title="Shape"
				description="The kit's corners, spacing and lines, everywhere at once. The preview follows as you drag."
			>
				<div class="px-4 py-4">
					<ShapePreview />
				</div>
				<SettingsRow
					label="Corner roundness"
					description="From square to soft. 100% is the design."
				>
					<RowSlider
						label="Corner roundness"
						limits={APPEARANCE_LIMITS.radius}
						value={appearance().radius}
						onChange={(radius) => updateAppearance({ radius })}
						format={percent}
					/>
				</SettingsRow>
				<SettingsRow
					label="Spacing"
					description="Heights of rows and controls. Touch targets never drop below 44px."
				>
					<RowSlider
						label="Spacing"
						limits={APPEARANCE_LIMITS.spacing}
						value={appearance().spacing}
						onChange={(spacing) => updateAppearance({ spacing })}
						format={percent}
					/>
				</SettingsRow>
				<SettingsRow label="Line strength" description="How visible hairlines and outlines are.">
					<RowSlider
						label="Line strength"
						limits={APPEARANCE_LIMITS.lines}
						value={appearance().lines}
						onChange={(lines) => updateAppearance({ lines })}
						format={percent}
					/>
				</SettingsRow>
				<SettingsRow
					label="Interface scale"
					description="Zoom the whole interface. Ctrl+=, Ctrl+- and Ctrl+0 work too (⌘ on macOS)."
				>
					<RowSlider
						label="Interface scale"
						limits={APPEARANCE_LIMITS.uiScale}
						value={appearance().uiScale}
						onChange={(uiScale) => updateAppearance({ uiScale })}
						format={percent}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Depth"
					description="Light along the top edge of raised things, pressable buttons and a lifted selection."
				>
					<Switch
						label="Depth"
						checked={appearance().depth}
						onChange={(depth) => updateAppearance({ depth })}
					/>
				</SettingsRow>
			</SettingsGroup>
		</SettingsPage>
	);
}

/**
 * The kit in miniature, drawn with the real components, so each shape setting shows what it does
 * the moment it moves: corners, row heights, hairlines.
 */
function ShapePreview(): JSX.Element {
	return (
		<div class="surface-well flex flex-col gap-3 p-4" aria-hidden="true">
			<Row gap={2} wrap>
				<Button variant="primary" size="sm">
					New task
				</Button>
				<Button size="sm">Secondary</Button>
				<Badge tone="accent">Flagship</Badge>
				<Badge>3 open</Badge>
			</Row>
			<Row gap={2}>
				<div class="min-w-0 flex-1">
					<Input aria-label="Preview field" placeholder="Search tasks" />
				</div>
				<Switch label="Preview switch" checked={true} onChange={() => {}} />
			</Row>
			<div class="surface-card flex flex-col divide-y divide-line">
				<Stack gap={0.5} class="px-3 py-2.5">
					<Text tone="strong">Fix the login redirect loop</Text>
					<Text size="caption" tone="subtle">
						TASK-12 · In review
					</Text>
				</Stack>
				<Stack gap={0.5} class="px-3 py-2.5">
					<Text tone="strong">Speed up the test suite</Text>
					<Text size="caption" tone="subtle">
						TASK-9 · Done
					</Text>
				</Stack>
			</div>
		</div>
	);
}
