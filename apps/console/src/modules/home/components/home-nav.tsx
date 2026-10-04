import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { NavLink, Segmented, StatusDot } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { ShellSlot, useShell } from "@/modules/shell";

/**
 * Home's two pages, Today and Pulse: in the panel beside the rail (each with a line about it),
 * and on phones as tabs over the page (Figma 07 · Home).
 */
export function HomeNav(props: {
	current: "today" | "pulse";
	today?: string;
	waiting?: boolean;
	pulse?: string;
}): JSX.Element {
	const shell = useShell();
	const navigate = useNavigate();
	return (
		<>
			<ShellSlot name="panel">
				<NavLink
					href={workspaceHref("/home")}
					current={props.current === "today"}
					icon={
						<Show when={props.waiting} fallback={<StatusDot status="offline" size="sm" />}>
							<StatusDot status="unread" size="sm" />
						</Show>
					}
					label="Today"
					detail={props.today}
				/>
				<NavLink
					href={workspaceHref("/home/pulse")}
					current={props.current === "pulse"}
					icon={<StatusDot status="online" size="sm" />}
					label="Pulse"
					detail={props.pulse ?? "The company at a glance"}
				/>
			</ShellSlot>
			<Show when={!shell.desktop()}>
				<Segmented<"today" | "pulse">
					label="Home"
					block
					value={props.current}
					onChange={(page) => navigate(page === "pulse" ? "/home/pulse" : "/home")}
					options={[
						{ value: "today", label: "Today" },
						{ value: "pulse", label: "Pulse" },
					]}
				/>
			</Show>
		</>
	);
}
