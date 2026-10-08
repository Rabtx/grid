"use client";

import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { Install, INSTALLS } from "../data/landing.data";

/**
 * The two one-line installs, as tabs, with the command ready to copy. The installs come from the
 * server: their URL is the site's own, which only the server knows (a browser has no Vercel env).
 */
export function InstallCommand({
	installs,
	className,
}: {
	installs: typeof INSTALLS;
	className?: string;
}) {
	const [active, setActive] = useState<Install["id"]>("grid");
	const [copied, setCopied] = useState(false);
	const id = useId();
	const install = installs.find((option) => option.id === active) ?? installs[0];

	async function copy() {
		try {
			await navigator.clipboard.writeText(install.command);
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch {
			// No clipboard (an insecure origin): the command stays selectable by hand.
		}
	}

	return (
		<div className={cn("w-full max-w-[640px] text-left", className)}>
			<div role="tablist" aria-label="What to install" className="flex gap-1">
				{installs.map((option) => (
					<button
						key={option.id}
						type="button"
						role="tab"
						id={`${id}-${option.id}`}
						aria-selected={option.id === active}
						aria-controls={`${id}-panel`}
						onClick={() => {
							setActive(option.id);
							setCopied(false);
						}}
						className={cn(
							"h-8 rounded-full px-3.5 font-medium text-[13px] transition-colors",
							option.id === active
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{option.label}
					</button>
				))}
			</div>
			<div
				role="tabpanel"
				id={`${id}-panel`}
				aria-labelledby={`${id}-${active}`}
				className="mt-3 flex min-w-0 items-start gap-2 rounded-2xl border border-border bg-card py-2 pr-2 pl-4 sm:items-center"
			>
				<span
					aria-hidden
					className="select-none py-1.5 font-mono text-[13px] text-muted-foreground"
				>
					$
				</span>
				<code className="min-w-0 flex-1 break-all py-1.5 font-mono text-[13px] sm:break-normal sm:whitespace-nowrap">
					{install.command}
				</code>
				<button
					type="button"
					onClick={copy}
					aria-label={copied ? "Copied" : "Copy the command"}
					className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={16} />
				</button>
			</div>
			<p className="mt-3 px-1 text-muted-foreground text-sm">{install.summary}</p>
		</div>
	);
}
