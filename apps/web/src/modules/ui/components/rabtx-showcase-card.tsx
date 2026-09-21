"use client";

import { Badge } from "@grid/ui/components/badge";
import { Button } from "@grid/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@grid/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@grid/ui/components/tabs";
import { cn } from "@grid/ui/lib/utils";
import { CodeIcon, Copy01Icon, EyeIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";

interface RabtxShowcaseCardProps {
	id: string;
	title: string;
	description: string;
	badge?: string;
	codeSnippet: string;
	children: ReactNode;
	depthMode?: boolean;
}

export function RabtxShowcaseCard({
	id,
	title,
	description,
	badge,
	codeSnippet,
	children,
	depthMode = true,
}: RabtxShowcaseCardProps) {
	const [copied, setCopied] = useState(false);
	const [activeTab, setActiveTab] = useState("preview");

	const handleCopy = () => {
		navigator.clipboard.writeText(codeSnippet);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<motion.div
			id={id}
			initial={{ opacity: 0, y: 15 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.35, ease: "easeOut" }}
			className="w-full"
		>
			<Card
				className={cn(
					"overflow-hidden transition-all duration-300 border-border/70 bg-card/95 backdrop-blur-sm",
					depthMode &&
						"shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_35px_rgb(0,0,0,0.35)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_12px_45px_rgb(0,0,0,0.5)] border-border/80",
				)}
			>
				<CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
					<div className="space-y-1">
						<div className="flex items-center gap-2.5">
							<CardTitle className="text-base font-bold tracking-tight text-foreground">
								{title}
							</CardTitle>
							{badge && (
								<Badge
									variant="outline"
									className="text-[10px] px-2 py-0 h-4 font-mono font-medium border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-500/10"
								>
									{badge}
								</Badge>
							)}
						</div>
						<CardDescription className="text-xs text-muted-foreground">
							{description}
						</CardDescription>
					</div>

					<Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
						<TabsList className="h-8 bg-muted/60 p-0.5 rounded-lg border border-border/40">
							<TabsTrigger
								value="preview"
								className="h-7 text-xs px-2.5 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm font-medium"
							>
								<HugeiconsIcon icon={EyeIcon} size={13} strokeWidth={2} />
								Preview
							</TabsTrigger>
							<TabsTrigger
								value="code"
								className="h-7 text-xs px-2.5 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm font-medium"
							>
								<HugeiconsIcon icon={CodeIcon} size={13} strokeWidth={2} />
								Code
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</CardHeader>

				<CardContent className="p-0">
					{activeTab === "preview" && (
						<div className="relative min-h-[220px] w-full flex items-center justify-center p-8 bg-gradient-to-b from-muted/30 via-background to-muted/20 border-b border-border/30 overflow-hidden group/canvas">
							{/* Background Subtle Grid Effect */}
							<div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
							{depthMode && (
								<div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,color-mix(in_oklab,var(--dashboard-accent,#0f766e)_6%,transparent),transparent)] pointer-events-none" />
							)}

							<div className="relative z-10 w-full flex flex-col items-center justify-center gap-4">
								{children}
							</div>
						</div>
					)}

					{activeTab === "code" && (
						<div className="relative bg-zinc-950 text-zinc-100 p-4 font-mono text-xs overflow-x-auto max-h-[350px] scrollbar-thin">
							<Button
								variant="ghost"
								size="sm"
								onClick={handleCopy}
								className="absolute right-3 top-3 h-7 px-2 text-xs bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 gap-1.5 border border-zinc-700/60"
							>
								<HugeiconsIcon
									icon={copied ? Tick02Icon : Copy01Icon}
									size={13}
									strokeWidth={2}
									className={copied ? "text-emerald-400" : ""}
								/>
								{copied ? "Copied!" : "Copy"}
							</Button>
							<pre className="pr-16 leading-relaxed">
								<code>{codeSnippet}</code>
							</pre>
						</div>
					)}
				</CardContent>
			</Card>
		</motion.div>
	);
}
