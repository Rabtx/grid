import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { IconButton } from "./button";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "./icons";

/**
 * A value to hand to something outside Grid (a webhook's address, a key, a link): shown in a
 * read-only field with a copy button, and, for a secret, hidden until asked for.
 */
export function CopyLine(props: {
	label: string;
	value: string;
	/** Hidden behind dots until shown. */
	secret?: boolean;
}): JSX.Element {
	const [shown, setShown] = createSignal(false);
	const [copied, setCopied] = createSignal(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(props.value);
		} catch (cause) {
			console.warn("[copy] the browser refused the clipboard:", cause);
			return;
		}
		setCopied(true);
		clearTimeout(timer);
		timer = setTimeout(() => setCopied(false), 1500);
	};
	return (
		<div class="flex min-w-0 items-center gap-1">
			<input
				readonly
				aria-label={props.label}
				type={props.secret && !shown() ? "password" : "text"}
				value={props.value}
				onFocus={(event) => event.currentTarget.select()}
				class="surface-field h-kit-control w-full min-w-0 bg-fill px-3 font-mono text-caption text-fg outline-none"
			/>
			<Show when={props.secret}>
				<IconButton
					label={shown() ? `Hide ${props.label}` : `Show ${props.label}`}
					size="sm"
					onClick={() => setShown((value) => !value)}
				>
					{shown() ? <EyeOffIcon size="sm" /> : <EyeIcon size="sm" />}
				</IconButton>
			</Show>
			<IconButton
				label={copied() ? "Copied" : `Copy ${props.label}`}
				size="sm"
				onClick={() => void copy()}
			>
				{copied() ? <CheckIcon size="sm" /> : <CopyIcon size="sm" />}
			</IconButton>
		</div>
	);
}
