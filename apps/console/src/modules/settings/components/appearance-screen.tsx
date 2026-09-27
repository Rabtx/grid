import type { JSX } from "@solidjs/web";

import {
	Badge,
	Button,
	ColorSwatches,
	playArrival,
	Input,
	RestoreIcon,
	Row,
	Segmented,
	SettingsGroup,
	SettingsRow,
	Slider,
	SparklesIcon,
	Stack,
	Switch,
	Text,
} from "@/kit";
import {
	ACCENT_PRESETS,
	APPEARANCE_LIMITS,
	appearance,
	type Density,
	resetAppearance,
	type Theme,
	updateAppearance,
} from "@/lib/appearance";

import { SettingsPage } from "./settings-page";

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

/**
 * Settings → Appearance: how the console looks on this device. Theme and accent, the tint every
 * surface takes, the kit's shape — corners, spacing, hairlines, density and scale — with a live
 * preview, and the celebrations. Saved on this device, like a zoom level.
 */
export function AppearanceScreen(): JSX.Element {
	return (
		<SettingsPage
			title="Appearance"
			description="These settings are saved on this device."
			actions={
				<Button variant="ghost" icon={<RestoreIcon size="sm" />} onClick={() => resetAppearance()}>
					Restore defaults
				</Button>
			}
		>
			<SettingsGroup
				title="Theme"
				description="Dark and light share the same tint, so the colour settings below apply to both."
			>
				<SettingsRow label="Theme" description="System follows your device's appearance.">
					<Segmented<Theme>
						label="Theme"
						options={[
							{ value: "system", label: "System" },
							{ value: "dark", label: "Dark" },
							{ value: "light", label: "Light" },
						]}
						value={appearance().theme}
						onChange={(theme) => updateAppearance({ theme })}
					/>
				</SettingsRow>
				<SettingsRow
					label="Accent colour"
					description="Primary actions, focus rings and the celebration's glow."
				>
					<ColorSwatches
						label="Accent colour"
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
			</SettingsGroup>

			<SettingsGroup
				title="Shape and density"
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
					label="Density"
					description="How much the lists and transcripts fit on a screen."
				>
					<Segmented<Density>
						label="Density"
						options={[
							{ value: "compact", label: "Compact" },
							{ value: "comfortable", label: "Comfortable" },
							{ value: "spacious", label: "Spacious" },
						]}
						value={appearance().density}
						onChange={(density) => updateAppearance({ density })}
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
			</SettingsGroup>

			<SettingsGroup title="Motion and fun" description="Small moments of delight, on this device.">
				<SettingsRow
					inline
					label="Celebrations"
					description="A warp arrival when you pick a flagship model. Desktop only, and never with reduced motion."
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
