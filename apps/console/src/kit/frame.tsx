import type { JSX } from "@solidjs/web";
import { onSettled, Show } from "solid-js";

import { BrandLogo } from "./brand";

/**
 * The signed-in app: the sidebar on the sunken frame and the screen flush beside it under its
 * header, sized to the visible viewport so everything stays above a phone keyboard. The page
 * itself never scrolls; screens scroll inside `main`.
 */
export function AppFrame(props: {
	/** The desktop sidebar; phones reach it through a drawer instead. */
	sidebar?: JSX.Element;
	header: JSX.Element;
	/** Screens that fill the frame and scroll inside themselves (a chat, a terminal). */
	bleed?: boolean;
	/** Dialogs, drawers and palettes that belong to the app. */
	overlays?: JSX.Element;
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

	return (
		<div class="flex h-[var(--app-height,100dvh)] overflow-hidden bg-surface text-fg lg:bg-surface-sunken">
			<Show when={props.sidebar}>
				<aside class="hidden w-60 shrink-0 lg:block">{props.sidebar}</aside>
			</Show>
			<div
				class={`surface-canvas flex min-w-0 flex-1 flex-col ${props.sidebar ? "lg:border-line lg:border-l" : ""}`}
			>
				{props.header}
				<main
					class={
						props.bleed
							? "flex min-h-0 flex-1 flex-col overflow-hidden"
							: "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4 md:px-6 md:pt-5"
					}
				>
					{props.children}
				</main>
			</div>
			{props.overlays}
		</div>
	);
}

/** Signing in, setup and invites: the brand on top, the page's card centred on the backdrop. */
export function AuthFrame(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="flex min-h-dvh flex-col bg-surface text-fg md:bg-surface-sunken">
			<header class="flex h-14 shrink-0 items-center px-4 pt-[env(safe-area-inset-top)] md:h-24 md:justify-center">
				<BrandLogo class="h-6" />
			</header>
			<main class="flex flex-1 items-start justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-6 md:pt-[2vh]">
				{props.children}
			</main>
		</div>
	);
}
