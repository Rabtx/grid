"use client";

import { SidebarInset, SidebarProvider } from "@grid/ui/components/sidebar";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { RabtxSidebar, RabtxTopbar, SHADCN_COMPONENTS_NAV } from "@/modules/ui";

export default function RabtxLayout({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const [depthMode, setDepthMode] = useState(true);

	const slug = pathname.split("/").pop() || "tabs";
	const activeItemObject = SHADCN_COMPONENTS_NAV.flatMap((cat) => cat.items).find(
		(item) => item.id === slug,
	);
	const activeItemName = activeItemObject ? activeItemObject.name : "Motion Tabs";

	return (
		<SidebarProvider defaultOpen={true}>
			<div className="min-h-screen w-full flex bg-background text-foreground selection:bg-teal-500/20 selection:text-teal-500">
				<RabtxSidebar />

				<SidebarInset className="flex flex-col flex-1 min-w-0 bg-background">
					<RabtxTopbar
						activeItemName={activeItemName}
						depthMode={depthMode}
						onToggleDepth={() => setDepthMode(!depthMode)}
					/>

					<main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 max-w-6xl mx-auto w-full">
						{children}
					</main>
				</SidebarInset>
			</div>
		</SidebarProvider>
	);
}
