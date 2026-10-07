import { useMatch } from "@solidjs/router";
import { createEffect, createSignal } from "solid-js";
import { RunnerError } from "@/lib/runner-client";
import { useAuth } from "@/modules/auth";
import { placementsStore } from "@/modules/environments";

export function operateMessage(cause: unknown): string {
	return cause instanceof Error ? cause.message : "Operate did not answer";
}
export function useOperateContext() {
	const auth = useAuth();
	const match = useMatch(() => "/operate/:slug");
	const project = () => match()?.params.slug ?? "";
	const key = () => {
		placementsStore.placements();
		return JSON.stringify([auth.token(), project(), placementsStore.scopeOf(project())]);
	};
	let generation = 0;
	createEffect(key, () => {
		generation++;
		return () => {
			generation++;
		};
	});
	const capture = () => ({ key: key(), generation });
	const current = (ticket: ReturnType<typeof capture>) =>
		ticket.generation === generation && ticket.key === key();
	return { token: auth.token, project, key, capture, current };
}
/** A read belongs to one account/project/placement and one selected source. */
export function useOperateRead<T>(
	request: (token: string, project: string, selection: string) => Promise<T>,
	selection: () => string = () => "read",
	interval = 0,
) {
	const context = useOperateContext();
	const [value, setValue] = createSignal<T | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [forbidden, setForbidden] = createSignal(false);
	const [loading, setLoading] = createSignal(false);
	let refresh = () => {};
	createEffect(
		() => [context.key(), selection(), context.token(), context.project()] as const,
		([key, selected, token, project]) => {
			let alive = true;
			let latest = 0;
			setValue(null);
			setError(null);
			setForbidden(false);
			setLoading(false);
			if (!token || !project || !selected) return;
			async function load() {
				const ticket = ++latest;
				setLoading(true);
				try {
					const result = await request(token as string, project, selected);
					if (!alive || key !== context.key() || selected !== selection() || ticket !== latest)
						return;
					setValue(() => result);
					setError(null);
					setForbidden(false);
				} catch (cause) {
					if (!alive || key !== context.key() || selected !== selection() || ticket !== latest)
						return;
					setValue(null);
					setError(operateMessage(cause));
					setForbidden(cause instanceof RunnerError && cause.status === 403);
				} finally {
					if (alive && key === context.key() && selected === selection() && ticket === latest)
						setLoading(false);
				}
			}
			refresh = () => void load();
			void load();
			// Polling pauses while the tab is hidden and reads at once when it is back.
			const visible = () => document.visibilityState === "visible";
			const timer = interval
				? setInterval(() => {
						if (visible()) void load();
					}, interval)
				: undefined;
			const returned = () => {
				if (interval && visible()) void load();
			};
			document.addEventListener("visibilitychange", returned);
			return () => {
				alive = false;
				latest++;
				if (timer) clearInterval(timer);
				document.removeEventListener("visibilitychange", returned);
				refresh = () => {};
			};
		},
	);
	return { value, error, forbidden, loading, refresh: () => refresh(), context };
}
