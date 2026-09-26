import type { JSX } from "@solidjs/web";
import { Show, omit } from "solid-js";

const ROW =
	"focus-ring group/nav flex h-kit-row w-full min-w-0 items-center gap-2.5 rounded-kit px-2 text-left text-body text-fg-muted transition-colors duration-fast ease-out-grid hover:bg-fill hover:text-fg aria-[current=page]:bg-fill-strong aria-[current=page]:font-medium aria-[current=page]:text-fg";

type NavItemProps = {
	icon?: JSX.Element;
	label: JSX.Element;
	/** Right-hand detail: a count, a shortcut, a badge, an arrow. */
	trailing?: JSX.Element;
	current?: boolean;
	class?: string;
};

function Content(props: NavItemProps): JSX.Element {
	return (
		<>
			<Show when={props.icon}>
				<span class="grid size-4 shrink-0 place-items-center text-fg-subtle group-hover/nav:text-fg-muted group-aria-[current=page]/nav:text-fg">
					{props.icon}
				</span>
			</Show>
			<span class="min-w-0 flex-1 truncate">{props.label}</span>
			<Show when={props.trailing}>
				<span class="flex shrink-0 items-center gap-1">{props.trailing}</span>
			</Show>
		</>
	);
}

/** A sidebar destination that is a link. */
export function NavLink(
	props: NavItemProps & Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children">,
): JSX.Element {
	const rest = omit(props, "icon", "label", "trailing", "current", "class");
	return (
		<a
			{...rest}
			aria-current={props.current ? "page" : undefined}
			class={`${ROW} ${props.class ?? ""}`}
		>
			<Content {...props} />
		</a>
	);
}

/** A sidebar entry that does something (search, a new chat). */
export function NavButton(
	props: NavItemProps & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
): JSX.Element {
	const rest = omit(props, "icon", "label", "trailing", "current", "class");
	return (
		<button
			type="button"
			{...rest}
			aria-current={props.current ? "page" : undefined}
			class={`${ROW} ${props.class ?? ""}`}
		>
			<Content {...props} />
		</button>
	);
}

/** A group in the sidebar: a quiet label, an optional action, then its items. */
export function NavSection(props: {
	label: string;
	action?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section class="flex flex-col gap-px">
			<div class="group/section flex h-7 items-center justify-between px-2 pointer-coarse:h-9">
				<h3 class="text-caption text-fg-subtle">{props.label}</h3>
				<Show when={props.action}>
					<span class="opacity-0 transition-opacity duration-fast group-hover/section:opacity-100 group-focus-within/section:opacity-100 pointer-coarse:opacity-100">
						{props.action}
					</span>
				</Show>
			</div>
			{props.children}
		</section>
	);
}
