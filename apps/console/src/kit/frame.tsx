import type { JSX } from "@solidjs/web";
import { onSettled, Show } from "solid-js";

import { BrandMark } from "./brand";

/**
 * The signed-in app: the sidebar on the sunken frame and the screen flush beside it under its
 * header, sized to the visible viewport so everything stays above a phone keyboard. The page
 * itself never scrolls; screens scroll inside `main`.
 */
export function AppFrame(props: {
	/** The desktop icon rail (the Figma Grid/Sidebar/Rail); phones reach it in the drawer. */
	rail?: JSX.Element;
	/** The desktop panel beside the rail; folded away when the person hides it. */
	sidebar?: JSX.Element;
	header: JSX.Element;
	/** Screens that fill the frame and scroll inside themselves (a chat, a terminal). */
	bleed?: boolean;
	/** Dialogs, drawers and palettes that belong to the app. */
	overlays?: JSX.Element;
	/**
	 * Desktop: the sidebar floats as a card over one canvas under a borderless top bar (the Figma
	 * Floating sidebar) instead of a rail and panel down the side.
	 */
	floating?: boolean;
	/** With `floating`: what sits in the canvas's lower corners (settings, the machine). */
	corners?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	onSettled(() => {
		const html = document.documentElement;
		const fit = () => {
			const height = window.visualViewport?.height ?? window.innerHeight;
			html.style.setProperty("--app-height", `${height}px`);
		};
		fit();
		const previous = html.style.overflow;
		html.style.overflow = "hidden";
		window.visualViewport?.addEventListener("resize", fit);
		window.addEventListener("resize", fit);
		return () => {
			html.style.overflow = previous;
			html.style.removeProperty("--app-height");
			window.visualViewport?.removeEventListener("resize", fit);
			window.removeEventListener("resize", fit);
		};
	});

	const main = (
		<main
			class={
				props.bleed
					? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
					: "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4 md:px-6 md:pt-5"
			}
		>
			{props.children}
		</main>
	);

	return (
		<Show
			when={!props.floating}
			fallback={
				<div class="flex h-[var(--app-height,100dvh)] flex-col overflow-hidden bg-surface text-fg">
					{props.header}
					<div class="relative flex min-h-0 flex-1">
						{/* 16px around a 232px card; its foot is kept clear for the corner controls. */}
						<Show when={props.sidebar}>
							<div class="hidden w-66 shrink-0 flex-col px-4 pt-2 pb-14 lg:flex">
								{props.sidebar}
							</div>
						</Show>
						{main}
						{props.corners}
					</div>
					{props.overlays}
				</div>
			}
		>
			<div class="flex h-[var(--app-height,100dvh)] overflow-hidden bg-surface text-fg">
				{/* Rail and panel share the Figma bg/subtle: a breath of ink over the app surface. */}
				<Show when={props.rail || props.sidebar}>
					<div class="hidden shrink-0 border-line border-r bg-fill lg:flex">
						<Show when={props.rail}>
							<div class="w-12 shrink-0 rail-labels:w-17">{props.rail}</div>
						</Show>
						<Show when={props.sidebar}>
							<aside class={`w-55 shrink-0 ${props.rail ? "border-line border-l" : ""}`}>
								{props.sidebar}
							</aside>
						</Show>
					</div>
				</Show>
				<div class="flex min-w-0 flex-1 flex-col">
					{props.header}
					{main}
				</div>
				{props.overlays}
			</div>
		</Show>
	);
}

/** A control pinned to a lower corner of the floating canvas. */
export function CanvasCorner(props: { side: "start" | "end"; children: JSX.Element }): JSX.Element {
	return (
		<div
			class={`absolute bottom-4 z-10 hidden items-center lg:flex ${props.side === "start" ? "left-4" : "right-4"}`}
		>
			{props.children}
		</div>
	);
}

/**
 * Signing in, setup and invites (the Figma 01 · Auth frames): the canvas, the page's card in the
 * middle on desktop and as a sheet from the bottom on phones, and where this Grid lives at the foot.
 */
export function AuthFrame(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="flex min-h-dvh flex-col bg-surface-sunken pt-safe text-fg">
			<main class="flex flex-1 flex-col justify-end md:items-center md:justify-center md:p-6">
				{props.children}
			</main>
			<footer class="hidden pb-6 text-center text-caption text-fg-muted md:block">
				{window.location.host}
			</footer>
		</div>
	);
}

/** The auth page's card (Figma Card / Sheet): 400px, 32px in, the card depth; a sheet on phones. */
export function AuthCard(props: { children: JSX.Element; wide?: boolean }): JSX.Element {
	return (
		<div
			class={`surface-auth flex w-full flex-col gap-6 px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] md:p-8 ${props.wide ? "md:max-w-lg" : "md:max-w-100"}`}
		>
			{props.children}
		</div>
	);
}

/**
 * The auth card's head: a 24px title and the line under it, with the mark above on sign-in.
 * Centred on desktop, from the left on the phone sheet, as the Figma frames set them.
 */
export function AuthHead(props: {
	title: string;
	mark?: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex flex-col items-start gap-6 md:items-center md:text-center">
			<Show when={props.mark}>
				<BrandMark class="size-10" />
			</Show>
			<div class="flex flex-col gap-2">
				<h1 class="font-medium text-fg text-headline">{props.title}</h1>
				<p class="text-body-lg text-fg-muted">{props.children}</p>
			</div>
		</div>
	);
}
