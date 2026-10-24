import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import {
	Alert,
	IconButton,
	KeyRecorder,
	notify,
	RestoreIcon,
	SettingsGroup,
	SettingsRow,
} from "@/kit";
import {
	bindings,
	chordLabel,
	chordOf,
	command,
	COMMANDS,
	type CommandGroup,
	type CommandId,
	isCustomised,
	resetAllBindings,
	resetBindings,
	setBindings,
} from "@/lib/keybindings";

import { SettingsPage, settingsMenu } from "./settings-page";

const GROUPS: readonly { group: CommandGroup; description: string }[] = [
	{ group: "General", description: "Search, settings and dictation" },
	{ group: "Navigation", description: "Moving between Grid's screens" },
	{ group: "Tabs", description: "Chat tabs in the project you are in" },
	{ group: "Chat", description: "The thread in front of you" },
	{ group: "View", description: "Panels and zoom" },
	{ group: "Lists", description: "The board and the inbox" },
];

// A plain first key may start a sequence ("g b"): the second must come within this long.
const SEQUENCE_WAIT_MS = 1_000;

/**
 * Settings → Keybindings: every command and its keys. Click a command's keys and press new ones
 * (a chord such as Alt+W, or two plain keys in turn such as G then B); a key another command had
 * moves here, and that command is told. Kept on this device.
 */
export function KeybindingsScreen(): JSX.Element {
	const [recording, setRecording] = createSignal<CommandId | null>(null);
	const [pending, setPending] = createSignal<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const coarse = matchMedia("(pointer: coarse)").matches;

	// Read at once by the next key press; the signals (written in batches) only draw it.
	let recordingId: CommandId | null = null;
	let first: string | null = null;
	const record = (id: CommandId | null) => {
		recordingId = id;
		setRecording(id);
	};
	const hold = (chord: string | null) => {
		first = chord;
		setPending(chord);
	};
	const stop = () => {
		clearTimeout(timer);
		record(null);
		hold(null);
	};

	const commit = (id: CommandId, chord: string) => {
		const taken = COMMANDS.filter(
			(entry) => entry.id !== id && bindings(entry.id).includes(chord),
		).map((entry) => entry.label);
		setBindings(id, [chord]);
		stop();
		if (taken.length)
			notify({
				title: `${chordLabel(chord)
					.map((step) => step.join("+"))
					.join(" then ")} moved here`,
				description: `It was on ${taken.join(", ")}, which now has no key for it.`,
			});
	};

	onSettled(() => {
		const onKeydown = (event: KeyboardEvent) => {
			const id = recordingId;
			if (!id) return;
			// Nothing else hears a key pressed for the recorder, the app's own bindings included.
			event.preventDefault();
			event.stopImmediatePropagation();
			if (event.key === "Escape" && !first) return stop();
			const chord = chordOf(event);
			if (!chord) return;
			if (first) return commit(id, `${first} ${chord}`);
			if (chord.includes("+") && (event.ctrlKey || event.metaKey || event.altKey))
				return commit(id, chord);
			hold(chord);
			timer = setTimeout(() => commit(id, chord), SEQUENCE_WAIT_MS);
		};
		window.addEventListener("keydown", onKeydown, { capture: true });
		return () => {
			window.removeEventListener("keydown", onKeydown, { capture: true });
			clearTimeout(timer);
		};
	});

	return (
		<SettingsPage
			title="Keybindings"
			description="Every keyboard command, and the keys it is on. Changes apply on this device."
			subtitle="This device"
			menu={settingsMenu(
				"Keybindings",
				[{ items: [{ id: "reset", label: "Restore all defaults" }] }],
				() => {
					stop();
					resetAllBindings();
				},
			)}
		>
			<Show when={coarse}>
				<Alert tone="accent" title="Keybindings work with a keyboard attached" />
			</Show>
			<For each={GROUPS}>
				{(entry) => (
					<SettingsGroup title={entry.group} description={entry.description}>
						<For each={COMMANDS.filter((item) => item.group === entry.group)}>
							{(item) => (
								<SettingsRow
									inline
									label={item.label}
									description={
										isCustomised(item.id) ? `Default: ${defaultsLabel(item.id)}` : undefined
									}
								>
									<KeyRecorder
										label={item.label}
										bindings={bindings(item.id).map(chordLabel)}
										recording={recording() === item.id}
										pending={
											recording() === item.id && pending()
												? (chordLabel(pending() ?? "")[0] ?? [])
												: undefined
										}
										onRecord={() => {
											if (recordingId === item.id) return stop();
											stop();
											record(item.id);
										}}
									/>
									<Show
										when={isCustomised(item.id)}
										fallback={<span class="size-kit-control-sm" aria-hidden="true" />}
									>
										<IconButton
											label={`Restore the default keys for ${item.label}`}
											tooltip="Restore default"
											size="sm"
											onClick={() => resetBindings(item.id)}
										>
											<RestoreIcon />
										</IconButton>
									</Show>
								</SettingsRow>
							)}
						</For>
					</SettingsGroup>
				)}
			</For>
		</SettingsPage>
	);
}

function defaultsLabel(id: CommandId): string {
	const defaults = command(id).defaults;
	if (!defaults.length) return "none";
	return defaults
		.map((chord) =>
			chordLabel(chord)
				.map((step) => step.join("+"))
				.join(" then "),
		)
		.join(" or ");
}
