import type { JSX } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

import { Button, Dialog, PageDots, Stack, StepGlyph, Text } from "@/kit";

import { tourStore } from "./store";

// Not the instant the app opens: the screen settles first.
const SHOW_AFTER_MS = 1500;

/**
 * What is new, a slide per feature, shown once per edition on each device after the app has
 * settled, and again on asking (Settings → General → What's new). However it closes, it counts
 * as seen.
 */
export function FeatureTour(): JSX.Element {
	const [index, setIndex] = createSignal(0);
	const slide = () => tourStore.slides()[index()] ?? tourStore.slides()[0];
	const last = () => index() >= tourStore.slides().length - 1;

	onSettled(() => {
		if (tourStore.seen()) return;
		const timer = setTimeout(() => {
			setIndex(0);
			tourStore.showNew();
		}, SHOW_AFTER_MS);
		return () => clearTimeout(timer);
	});

	const close = () => {
		tourStore.close();
		setIndex(0);
	};

	return (
		<Dialog
			open={tourStore.open()}
			onClose={close}
			title="New in Grid"
			description={`${index() + 1} of ${tourStore.slides().length}`}
			width="34rem"
			footer={
				<>
					<Show when={index() > 0} fallback={<Button onClick={close}>Skip</Button>}>
						<Button onClick={() => setIndex((at) => at - 1)}>Back</Button>
					</Show>
					<Button variant="primary" onClick={() => (last() ? close() : setIndex((at) => at + 1))}>
						{last() ? "Done" : "Next"}
					</Button>
				</>
			}
		>
			<Show when={slide()}>
				{(current) => (
					<Stack gap={4} class="px-5 pb-2">
						<div class="flex items-center gap-3">
							<StepGlyph tone="accent">{current().icon()}</StepGlyph>
							<Text size="heading" tone="strong" weight="medium" as="h3">
								{current().title}
							</Text>
						</div>
						<Text>{current().pitch}</Text>
						<div aria-hidden="true" class="pointer-events-none select-none">
							{current().preview()}
						</div>
						<ul class="flex flex-col gap-1.5">
							{current().highlights.map((line) => (
								<li class="flex gap-2 text-body text-fg-muted">
									<span class="text-fg-subtle">•</span>
									<span>{line}</span>
								</li>
							))}
						</ul>
						<div class="flex justify-center text-fg-subtle">
							<PageDots count={tourStore.slides().length} current={index()} />
						</div>
					</Stack>
				)}
			</Show>
		</Dialog>
	);
}
