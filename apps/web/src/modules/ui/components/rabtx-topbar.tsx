"use client";

import { Badge } from "@grid/ui/components/badge";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@grid/ui/components/breadcrumb";
import { Button } from "@grid/ui/components/button";
import { SidebarTrigger } from "@grid/ui/components/sidebar";
import { ArrowLeft01Icon, Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

interface RabtxTopbarProps {
	activeItemName: string;
	depthMode: boolean;
	onToggleDepth: () => void;
}

export function RabtxTopbar({ activeItemName }: RabtxTopbarProps) {
	const [theme, setTheme] = useState<"light" | "dark">("dark");

	useEffect(() => {
		const isDark = document.documentElement.classList.contains("dark");
		setTheme(isDark ? "dark" : "light");
	}, []);

	const toggleTheme = () => {
		const newTheme = theme === "dark" ? "light" : "dark";
		setTheme(newTheme);
		if (newTheme === "dark") {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	};

	return (
		<header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-background px-4 transition-colors">
			<div className="flex items-center gap-3">
				<SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
				<div className="h-4 w-px bg-border" />
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink
								href="/"
								className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
							>
								<HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={2} />
								App Root
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink
								href="/ui"
								className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
							>
								Rabtx UI
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage className="text-xs font-semibold text-foreground flex items-center gap-1.5">
								<span className="w-1.5 h-1.5 rounded-full bg-foreground" />
								{activeItemName}
							</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</div>

			<div className="flex items-center gap-2">
				{/* Theme Switcher */}
				<Button
					variant="ghost"
					size="icon"
					onClick={toggleTheme}
					className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground transition-colors"
					title="Toggle theme"
				>
					<HugeiconsIcon
						icon={theme === "dark" ? Sun01Icon : Moon01Icon}
						size={16}
						strokeWidth={2}
					/>
				</Button>

				{/* Production Badge */}
				<Badge
					variant="secondary"
					className="hidden md:flex items-center gap-1 text-[11px] font-mono px-2 py-0.5"
				>
					shadcn UI Catalog
				</Badge>
			</div>
		</header>
	);
}
