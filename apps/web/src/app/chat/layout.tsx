import type { Metadata } from "next";

import { RequireAuth } from "@/modules/auth/components";
import "@/modules/chat/styles/chat.css";

export const metadata: Metadata = {
	title: "Chat | Grid",
	description: "Grid chat workspace",
};

export default function ChatLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return <RequireAuth>{children}</RequireAuth>;
}
