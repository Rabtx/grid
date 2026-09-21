"use client";

import { Badge } from "@grid/ui/components/badge";
import { Input } from "@grid/ui/components/input";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "@grid/ui/components/sidebar";
import { cn } from "@grid/ui/lib/utils";
import { Search01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SHADCN_COMPONENTS_NAV } from "../data/shadcn-components";

export function RabtxSidebar() {
	const [searchQuery, setSearchQuery] = useState("");
	const { state } = useSidebar();
	const pathname = usePathname();
	const isCollapsed = state === "collapsed";

	const filteredCategories = SHADCN_COMPONENTS_NAV.map((category) => ({
		...category,
		items: category.items.filter((item) =>
			item.name.toLowerCase().includes(searchQuery.toLowerCase()),
		),
	})).filter((category) => category.items.length > 0);

	const totalCount = SHADCN_COMPONENTS_NAV.reduce((sum, cat) => sum + cat.items.length, 0);

	return (
		<Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
			<SidebarHeader className="border-b border-border p-3.5 space-y-3">
				<div className="flex items-center justify-between">
					<Link href="/ui/tabs" className="flex items-center gap-2.5 group">
						<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-semibold shadow-xs">
							<HugeiconsIcon icon={SparklesIcon} size={18} strokeWidth={2} />
						</div>
						{!isCollapsed && (
							<div className="flex flex-col">
								<div className="flex items-center gap-1.5">
									<span className="font-semibold text-sm tracking-tight text-foreground">
										Rabtx UI
									</span>
									<Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-mono">
										v1.0
									</Badge>
								</div>
								<span className="text-[11px] text-muted-foreground">shadcn UI Catalog</span>
							</div>
						)}
					</Link>
					<SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
				</div>

				{!isCollapsed && (
					<div className="relative">
						<HugeiconsIcon
							icon={Search01Icon}
							size={14}
							strokeWidth={2}
							className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							placeholder={`Search ${totalCount} component...`}
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="h-8 text-xs pl-8 pr-3 bg-background border-border"
						/>
					</div>
				)}
			</SidebarHeader>

			<SidebarContent className="px-2 py-2 scrollbar-thin">
				{filteredCategories.map((category) => (
					<SidebarGroup key={category.id} className="py-1.5">
						{!isCollapsed && (
							<SidebarGroupLabel className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
								{category.title}
							</SidebarGroupLabel>
						)}
						<SidebarGroupContent>
							<SidebarMenu>
								{category.items.map((item) => {
									const itemPath = `/ui/${item.id}`;
									const isActive =
										pathname === itemPath || (pathname === "/ui" && item.id === "tabs");
									return (
										<SidebarMenuItem key={item.id}>
											<SidebarMenuButton
												isActive={isActive}
												tooltip={item.name}
												className={cn(
													"h-8 px-2.5 text-xs font-medium rounded-md transition-colors",
													isActive
														? "bg-accent text-accent-foreground font-semibold"
														: "text-muted-foreground hover:text-foreground hover:bg-muted/60",
												)}
											>
												<Link href={itemPath} className="flex items-center gap-2 w-full">
													<HugeiconsIcon icon={item.icon} size={15} strokeWidth={2} />
													<span>{item.name}</span>
												</Link>
											</SidebarMenuButton>
											{item.badge && !isCollapsed && (
												<SidebarMenuBadge className="text-[10px] font-mono px-1.5 py-0">
													{item.badge}
												</SidebarMenuBadge>
											)}
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
