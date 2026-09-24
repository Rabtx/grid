import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import { insertIntoField, MicButton, registerDictationTarget } from "@/modules/voice";
import { ChevronDownIcon, SendIcon, StopSquareIcon } from "@/ui";

import type { Choice } from "../types/chat.types";

/**
 * A compact picker in the composer's footer. A native select underneath, so phones get the
 * platform's own picker, which also copes with an agent offering hundreds of models.
 */
export function PillSelect(props: {
	label: string;
	value: string;
	options: readonly Choice[];
	onChange: (id: string) => void;
	icon?: JSX.Element;
	disabled?: boolean;
}): JSX.Element {
	const current = () =>
		props.options.find((option) => option.id === props.value)?.name ?? props.value;
	return (
		<label class="relative inline-flex h-7 min-w-0 max-w-[11rem] shrink items-center gap-1.5 rounded-md border border-ink/10 px-2 text-ink/70 text-ui-xs transition-colors duration-fast ease-out-grid focus-within:border-ink/30 hover:bg-ink/6 hover:text-ink pointer-coarse:h-9">
			{props.icon}
			<span class="truncate">{current()}</span>
			<ChevronDownIcon class="size-3 shrink-0 text-ink/40" />
			<select
				aria-label={props.label}
				value={props.value}
				disabled={props.disabled}
				onChange={(event) => props.onChange(event.currentTarget.value)}
				class="absolute inset-0 cursor-pointer opacity-0"
			>
				<For each={props.options}>
					{(option) => <option value={option.id}>{option.name}</option>}
				</For>
			</select>
		</label>
	);
}

/**
 * Where a message is written. Enter sends on a physical keyboard (Shift+Enter for a new line);
 * on a phone Enter is a new line and the send button sends. While the agent works, the button
 * stops it. A text field, so voice input lands here with no extra wiring.
 */
export function Composer(props: {
	placeholder: string;
	running: boolean;
	disabled?: boolean;
	/** Send the text; return false to keep the draft (e.g. the link is down). */
	onSend: (text: string) => boolean | Promise<boolean>;
	onStop?: () => void;
	/** The footer's pickers: agent, model, mode. */
	controls?: JSX.Element;
	/** Above the text box: e.g. the folder the agent works in. */
	header?: JSX.Element;
}): JSX.Element {
	const [draft, setDraft] = createSignal("");
	const [sending, setSending] = createSignal(false);
	let textarea: HTMLTextAreaElement | undefined;
	let form: HTMLFormElement | undefined;

	// The composer has its own mic next to Send (a floating one would sit on top of it).
	onSettled(() => {
		if (!form) return;
		return registerDictationTarget(form, {
			insert: (text) => {
				if (textarea) insertIntoField(textarea, text);
			},
			focus: () => textarea?.focus(),
			label: "Message",
			floatingMic: false,
		});
	});

	function grow(): void {
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
	}

	async function send(): Promise<void> {
		const text = draft().trim();
		if (!text || props.running || props.disabled || sending()) return;
		setSending(true);
		try {
			if (await props.onSend(text)) {
				setDraft("");
				if (textarea) textarea.value = "";
				grow();
			}
		} finally {
			setSending(false);
		}
	}

	return (
		<form
			ref={(el) => {
				form = el;
			}}
			class="rounded-xl border border-ink/12 bg-canvas shadow-sm transition-colors duration-fast ease-out-grid focus-within:border-ink/25"
			onSubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			<Show when={props.header}>
				<div class="flex min-w-0 items-center gap-2 px-3 pt-2 text-ink/50 text-ui-xs">
					{props.header}
				</div>
			</Show>
			<textarea
				ref={(el) => {
					textarea = el;
				}}
				rows={1}
				value={draft()}
				placeholder={props.placeholder}
				aria-label="Message"
				enterkeyhint="send"
				disabled={props.disabled}
				onInput={(event) => {
					setDraft(event.currentTarget.value);
					grow();
				}}
				onKeyDown={(event) => {
					// A physical keyboard sends on Enter; a phone's Enter makes a new line.
					if (
						event.key === "Enter" &&
						!event.shiftKey &&
						!event.isComposing &&
						matchMedia("(pointer: fine)").matches
					) {
						event.preventDefault();
						void send();
					}
				}}
				class="block max-h-60 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-ink text-ui-input outline-none placeholder:text-ink/35"
			/>
			<div class="flex items-center gap-1.5 px-2 pb-2">
				<div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
					{props.controls}
				</div>
				<MicButton
					target={() =>
						textarea
							? {
									insert: (text) => textarea && insertIntoField(textarea, text),
									focus: () => textarea?.focus(),
									label: "Message",
									floatingMic: false,
								}
							: null
					}
					class="focus-ring grid size-8 shrink-0 place-items-center rounded-lg text-ink/55 transition-colors duration-fast ease-out-grid hover:bg-ink/8 hover:text-ink aria-pressed:bg-danger aria-pressed:text-canvas pointer-coarse:size-10"
				/>
				<Show
					when={props.running}
					fallback={
						<button
							type="submit"
							aria-label="Send"
							disabled={!draft().trim() || props.disabled || sending()}
							class="focus-ring grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-[opacity,transform] duration-fast ease-out-grid active:scale-95 disabled:opacity-30 pointer-coarse:size-10"
						>
							<SendIcon class="size-4" />
						</button>
					}
				>
					<button
						type="button"
						aria-label="Stop"
						onClick={() => props.onStop?.()}
						class="focus-ring grid size-8 shrink-0 place-items-center rounded-lg bg-ink/10 text-ink transition-transform duration-fast ease-out-grid active:scale-95 pointer-coarse:size-10"
					>
						<StopSquareIcon class="size-4" />
					</button>
				</Show>
			</div>
		</form>
	);
}
