"use client";

import { Toaster } from "@grid/ui/components/toast";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme";
import { AuthProvider } from "@/modules/auth/context";
import { QueryProvider } from "./providers/query-provider";

export function Providers({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider>
			<QueryProvider>
				<AuthProvider>
					<Toaster>{children}</Toaster>
				</AuthProvider>
			</QueryProvider>
		</ThemeProvider>
	);
}
