import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import { Attachment, Button, Row, Text } from "@/kit";
import type { ChatAttachment } from "../types/chat.types";

export type LoadAttachment = (id: string, signal?: AbortSignal) => Promise<Blob>;

export function MessageAttachments(props: {
	attachments: ChatAttachment[];
	load?: LoadAttachment;
}): JSX.Element {
	return (
		<Row wrap gap={2}>
			<For each={props.attachments}>
				{(attachment) => <MessageAttachment attachment={attachment} load={props.load} />}
			</For>
		</Row>
	);
}

function MessageAttachment(props: {
	attachment: ChatAttachment;
	load?: LoadAttachment;
}): JSX.Element {
	const [url, setUrl] = createSignal<string>();
	const [error, setError] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	const image = () => props.attachment.mimeType.startsWith("image/");
	const controller = new AbortController();
	let objectUrl: string | undefined;
	async function load(download = false): Promise<void> {
		if (!props.load || busy()) return;
		setBusy(true);
		setError(false);
		try {
			const blob = await props.load(props.attachment.id, controller.signal);
			if (controller.signal.aborted) return;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
			objectUrl = URL.createObjectURL(blob);
			setUrl(objectUrl);
			if (download) {
				const link = document.createElement("a");
				link.href = objectUrl;
				link.download = props.attachment.name;
				link.click();
			}
		} catch {
			if (!controller.signal.aborted) setError(true);
		} finally {
			setBusy(false);
		}
	}
	onSettled(() => {
		if (image()) void load();
		return () => {
			controller.abort();
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	});
	return (
		<>
			<Attachment
				name={props.attachment.name}
				size={props.attachment.size}
				preview={image() ? url() : undefined}
				href={image() ? url() : undefined}
				disabled={busy()}
				onOpen={() => void load(!image())}
			/>
			<Show when={error()}>
				<Text tone="danger">Attachment unavailable.</Text>
				<Button onClick={() => void load(!image())}>Retry</Button>
			</Show>
		</>
	);
}
