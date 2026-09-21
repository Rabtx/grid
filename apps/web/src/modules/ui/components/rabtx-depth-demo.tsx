"use client";

import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@grid/ui/components/avatar";
import { Badge } from "@grid/ui/components/badge";
import { Button } from "@grid/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@grid/ui/components/card";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@grid/ui/components/drawer";
import { Input } from "@grid/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@grid/ui/components/input-group";
import {
	Tabs as MotionTabs,
	TabsContent as MotionTabsContent,
	TabsList as MotionTabsList,
	TabsTrigger as MotionTabsTrigger,
} from "@grid/ui/components/motion/tabs";
import { Spinner } from "@grid/ui/components/spinner";
import { cn } from "@grid/ui/lib/utils";
import {
	Add01Icon,
	ArrowRight01Icon,
	CheckmarkCircle02Icon,
	Grid02Icon,
	Layers01Icon,
	Layout01Icon,
	Search01Icon,
	SecurityIcon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import { useState } from "react";

// ==========================================
// 1. RABTX TACTILE 3D BUTTONS DEMO
// ==========================================
export function RabtxButtonsDemo({ depthMode }: { depthMode: boolean }) {
	const [loading, setLoading] = useState(false);

	const triggerLoading = () => {
		setLoading(true);
		setTimeout(() => setLoading(false), 2000);
	};

	return (
		<div className="flex flex-wrap items-center justify-center gap-4 py-2">
			{/* 1. Spatial Spring Primary Button */}
			<motion.div whileHover={{ y: -3, scale: 1.02 }} whileTap={{ y: 1, scale: 0.98 }}>
				<Button
					size="lg"
					className={cn(
						"relative overflow-hidden font-semibold px-6 gap-2 rounded-xl transition-all duration-300",
						"bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 text-white",
						depthMode &&
							"shadow-[0_10px_25px_-5px_rgba(13,148,136,0.5)] border-t border-white/20 active:shadow-[0_2px_10px_rgba(13,148,136,0.3)]",
					)}
				>
					<span className="relative z-10 flex items-center gap-2">
						<HugeiconsIcon icon={SparklesIcon} size={17} strokeWidth={2} />
						Spatial Spring
					</span>
					{depthMode && (
						<div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
					)}
				</Button>
			</motion.div>

			{/* 2. Neon Shimmer Aura Button */}
			<motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
				<Button
					variant="outline"
					size="lg"
					className={cn(
						"relative font-semibold px-6 gap-2 rounded-xl transition-all duration-300 border-teal-500/40 bg-background/80 backdrop-blur-md text-foreground",
						depthMode &&
							"shadow-[0_0_20px_rgba(45,212,191,0.25)] hover:shadow-[0_0_30px_rgba(45,212,191,0.45)] hover:border-teal-500/80",
					)}
				>
					<HugeiconsIcon
						icon={CheckmarkCircle02Icon}
						size={17}
						strokeWidth={2}
						className="text-teal-500"
					/>
					Neon Shimmer
				</Button>
			</motion.div>

			{/* 3. Physical Press Depth Button */}
			<motion.div whileTap={{ y: 4 }} className="relative group">
				<Button
					size="lg"
					variant="secondary"
					className={cn(
						"font-semibold px-6 gap-2 rounded-xl transition-all border border-border/80",
						depthMode &&
							"shadow-[0_6px_0_0_var(--dashboard-border-strong,#dedede)] active:shadow-[0_0_0_0_transparent] active:translate-y-1.5 dark:shadow-[0_6px_0_0_rgba(255,255,255,0.15)]",
					)}
				>
					<HugeiconsIcon icon={Layers01Icon} size={17} strokeWidth={2} />
					Physical Depth
				</Button>
			</motion.div>

			{/* 4. Interactive Loader Morphing Button */}
			<motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
				<Button
					size="lg"
					onClick={triggerLoading}
					disabled={loading}
					className={cn(
						"font-semibold px-6 gap-2 rounded-xl transition-all min-w-[140px]",
						depthMode && "shadow-md shadow-primary/20",
					)}
				>
					{loading ? (
						<>
							<Spinner className="w-4 h-4 text-primary-foreground" />
							<span>Processing...</span>
						</>
					) : (
						<>
							<HugeiconsIcon icon={Add01Icon} size={17} strokeWidth={2.2} />
							<span>Click Loader</span>
						</>
					)}
				</Button>
			</motion.div>
		</div>
	);
}

// ==========================================
// 2. RABTX SPATIAL CARDS DEMO
// ==========================================
export function RabtxCardsDemo({ depthMode }: { depthMode: boolean }) {
	const [rotateX, setRotateX] = useState(0);
	const [rotateY, setRotateY] = useState(0);

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!depthMode) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const x = e.clientX - rect.left - rect.width / 2;
		const y = e.clientY - rect.top - rect.height / 2;
		setRotateX(-y / 12);
		setRotateY(x / 12);
	};

	const handleMouseLeave = () => {
		setRotateX(0);
		setRotateY(0);
	};

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl py-2">
			{/* Spatial 3D Parallax Tilt Card */}
			<motion.div
				style={{
					perspective: 1000,
				}}
				animate={{
					rotateX,
					rotateY,
				}}
				transition={{ type: "spring", stiffness: 300, damping: 20 }}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				className="w-full cursor-pointer"
			>
				<Card
					className={cn(
						"relative overflow-hidden border-teal-500/30 bg-gradient-to-br from-background via-muted/30 to-teal-500/5 transition-all duration-300",
						depthMode &&
							"shadow-[0_20px_50px_rgba(15,118,110,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-t border-l border-teal-500/40",
					)}
				>
					<div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<Badge
								variant="outline"
								className="text-[10px] px-2 py-0.5 border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-500/10"
							>
								3D Parallax Tilt
							</Badge>
							<span className="w-2 h-2 rounded-full bg-teal-500 animate-ping" />
						</div>
						<CardTitle className="text-lg font-bold mt-2">Spatial Control Deck</CardTitle>
						<CardDescription className="text-xs">
							Hover to feel real 3D spatial depth tilt micro-interactions.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3 text-xs text-muted-foreground">
						<div className="p-3 rounded-lg bg-background/80 backdrop-blur-sm border border-border/50 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<HugeiconsIcon
									icon={SecurityIcon}
									size={16}
									strokeWidth={2}
									className="text-teal-500"
								/>
								<span className="font-medium text-foreground">Spatial Elevation</span>
							</div>
							<span className="font-mono text-teal-600 dark:text-teal-400 font-bold">
								Level 4 Depth
							</span>
						</div>
					</CardContent>
					<CardFooter className="pt-0">
						<Button
							variant="ghost"
							size="sm"
							className="w-full text-xs gap-1.5 text-teal-600 dark:text-teal-400 hover:text-teal-700 hover:bg-teal-500/10"
						>
							Explore Parallax
							<HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
						</Button>
					</CardFooter>
				</Card>
			</motion.div>

			{/* Backlight Ambient Glow Card */}
			<motion.div whileHover={{ y: -4, scale: 1.01 }} className="w-full">
				<Card
					className={cn(
						"relative overflow-hidden border-border/70 bg-card/90 backdrop-blur-md transition-all duration-300",
						depthMode &&
							"shadow-[0_15px_35px_-10px_rgba(0,0,0,0.1)] dark:shadow-[0_15px_35px_-10px_rgba(0,0,0,0.45)] hover:border-emerald-500/50",
					)}
				>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<Badge
								variant="outline"
								className="text-[10px] px-2 py-0.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
							>
								Backlight Ambient
							</Badge>
							<HugeiconsIcon
								icon={SparklesIcon}
								size={16}
								strokeWidth={2}
								className="text-emerald-500"
							/>
						</div>
						<CardTitle className="text-lg font-bold mt-2">Layered Glass Card</CardTitle>
						<CardDescription className="text-xs">
							Subtle backdrop glow with crisp typography and layered elevation.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 text-xs text-muted-foreground">
						<p>
							Designed with strict design-system tokens and accessibility-first contrast ratios.
						</p>
					</CardContent>
					<CardFooter className="pt-2">
						<Button
							size="sm"
							variant="outline"
							className="w-full text-xs font-semibold gap-1.5 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
						>
							View Components
							<HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
						</Button>
					</CardFooter>
				</Card>
			</motion.div>
		</div>
	);
}

// ==========================================
// 3. RABTX ANIMATED TABS DEMO
// ==========================================
export function RabtxTabsDemo() {
	return (
		<div className="w-full max-w-lg py-2 space-y-6">
			{/* 1. Motion Pill Spring Tab */}
			<div className="space-y-2">
				<span className="text-[11px] font-mono text-muted-foreground font-medium">
					Motion Component: MotionTabs (variant: pill)
				</span>
				<MotionTabs defaultValue="components" variant="pill" className="w-full">
					<MotionTabsList className="grid w-full grid-cols-3">
						<MotionTabsTrigger value="components">Components</MotionTabsTrigger>
						<MotionTabsTrigger value="blocks">UI Blocks</MotionTabsTrigger>
						<MotionTabsTrigger value="motion">Motion</MotionTabsTrigger>
					</MotionTabsList>

					<div className="mt-3">
						<MotionTabsContent value="components" className="mt-0">
							<Card className="p-4 text-xs space-y-1.5 border-border/50">
								<div className="font-semibold text-foreground flex items-center gap-2">
									<HugeiconsIcon
										icon={Grid02Icon}
										size={16}
										strokeWidth={2}
										className="text-teal-500"
									/>
									Exclusion-Blended Spring Pill Indicator
								</div>
								<p className="text-muted-foreground">
									Glides smoothly between triggers with text exclusion color inversion from{" "}
									<code className="text-teal-600 dark:text-teal-400 font-mono text-[11px]">
										@grid/ui/components/motion/tabs
									</code>
									.
								</p>
							</Card>
						</MotionTabsContent>
						<MotionTabsContent value="blocks" className="mt-0">
							<Card className="p-4 text-xs space-y-1.5 border-border/50">
								<div className="font-semibold text-foreground flex items-center gap-2">
									<HugeiconsIcon
										icon={Layout01Icon}
										size={16}
										strokeWidth={2}
										className="text-emerald-500"
									/>
									Composite UI Blocks
								</div>
								<p className="text-muted-foreground">
									Pre-assembled cards, sidebars, and control decks.
								</p>
							</Card>
						</MotionTabsContent>
						<MotionTabsContent value="motion" className="mt-0">
							<Card className="p-4 text-xs space-y-1.5 border-border/50">
								<div className="font-semibold text-foreground flex items-center gap-2">
									<HugeiconsIcon
										icon={SparklesIcon}
										size={16}
										strokeWidth={2}
										className="text-cyan-500"
									/>
									Motion Physics Tokens
								</div>
								<p className="text-muted-foreground">
									Spring stiffness & damping configured via{" "}
									<code className="font-mono">SPRING_LAYOUT</code> in{" "}
									<code className="font-mono">@grid/ui/lib/ease</code>.
								</p>
							</Card>
						</MotionTabsContent>
					</div>
				</MotionTabs>
			</div>

			{/* 2. Motion Underline Spring Tab */}
			<div className="space-y-2 pt-2 border-t border-border/40">
				<span className="text-[11px] font-mono text-muted-foreground font-medium">
					Motion Component: MotionTabs (variant: underline)
				</span>
				<MotionTabs defaultValue="overview" variant="underline" className="w-full">
					<MotionTabsList className="w-full justify-start">
						<MotionTabsTrigger value="overview">Overview</MotionTabsTrigger>
						<MotionTabsTrigger value="analytics">Analytics</MotionTabsTrigger>
						<MotionTabsTrigger value="settings">Settings</MotionTabsTrigger>
					</MotionTabsList>

					<div className="mt-3">
						<MotionTabsContent value="overview" className="mt-0">
							<p className="text-xs text-muted-foreground">
								Line underline spring indicator sliding smoothly underneath active tab text.
							</p>
						</MotionTabsContent>
						<MotionTabsContent value="analytics" className="mt-0">
							<p className="text-xs text-muted-foreground">
								Analytics telemetry view with fluid panel entrance transitions.
							</p>
						</MotionTabsContent>
						<MotionTabsContent value="settings" className="mt-0">
							<p className="text-xs text-muted-foreground">
								Configuration and workspace preferences.
							</p>
						</MotionTabsContent>
					</div>
				</MotionTabs>
			</div>
		</div>
	);
}

// ==========================================
// 4. RABTX PULSING BADGES & INDICATORS DEMO
// ==========================================
export function RabtxBadgesDemo({ depthMode }: { depthMode: boolean }) {
	return (
		<div className="flex flex-wrap items-center justify-center gap-4 py-2">
			{/* Pulsing Beacon Badge */}
			<div
				className={cn(
					"inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300 transition-all",
					depthMode && "shadow-[0_0_15px_rgba(45,212,191,0.2)]",
				)}
			>
				<span className="relative flex h-2 w-2">
					<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
					<span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
				</span>
				Live System Active
			</div>

			{/* Glass Counter Badge */}
			<Badge
				variant="secondary"
				className={cn(
					"px-3 py-1 text-xs font-mono font-bold gap-1.5 rounded-lg border border-border/60",
					depthMode && "shadow-sm",
				)}
			>
				<span className="text-muted-foreground">Pending Queue:</span>
				<span className="text-teal-600 dark:text-teal-400">28 Items</span>
			</Badge>

			{/* Avatar Group with Status */}
			<div className="flex items-center gap-3 p-2 rounded-xl bg-background/60 border border-border/50">
				<AvatarGroup className="-space-x-2">
					<Avatar className="w-8 h-8 border-2 border-background ring-2 ring-teal-500/20">
						<AvatarImage src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" />
						<AvatarFallback>SK</AvatarFallback>
					</Avatar>
					<Avatar className="w-8 h-8 border-2 border-background ring-2 ring-teal-500/20">
						<AvatarImage src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80" />
						<AvatarFallback>AK</AvatarFallback>
					</Avatar>
					<Avatar className="w-8 h-8 border-2 border-background ring-2 ring-teal-500/20">
						<AvatarImage src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80" />
						<AvatarFallback>RM</AvatarFallback>
					</Avatar>
				</AvatarGroup>
				<span className="text-xs font-semibold text-foreground">3 Team Members Online</span>
			</div>
		</div>
	);
}

// ==========================================
// 5. RABTX ELEVATED INPUTS DEMO
// ==========================================
export function RabtxInputsDemo({ depthMode }: { depthMode: boolean }) {
	return (
		<div className="w-full max-w-md py-2 space-y-4">
			{/* Action Addon Input Group */}
			<InputGroup
				className={cn(
					"rounded-xl border border-border/70 transition-all duration-200 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/30",
					depthMode && "shadow-sm focus-within:shadow-[0_0_20px_rgba(45,212,191,0.2)]",
				)}
			>
				<InputGroupAddon className="pl-3 text-muted-foreground">
					<HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2} />
				</InputGroupAddon>
				<InputGroupInput
					placeholder="Search Rabtx UI elements..."
					className="text-xs border-0 focus-visible:ring-0"
				/>
				<InputGroupButton variant="ghost" size="sm" className="mr-1 text-xs font-semibold h-7">
					Search
				</InputGroupButton>
			</InputGroup>

			{/* Floating Focus Input */}
			<div className="space-y-1.5">
				<label htmlFor="workspace-name-input" className="text-xs font-medium text-muted-foreground">
					Workspace Name
				</label>
				<Input
					id="workspace-name-input"
					placeholder="e.g. Rabtx Design System"
					className={cn(
						"h-10 text-xs rounded-xl border-border/70 bg-background/80 transition-all",
						depthMode &&
							"shadow-[0_2px_10px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.3)] focus-visible:ring-teal-500/40",
					)}
				/>
			</div>
		</div>
	);
}

// ==========================================
// 6. RABTX DRAWER & OVERLAYS DEMO
// ==========================================
export function RabtxDrawerDemo({ depthMode }: { depthMode: boolean }) {
	return (
		<div className="flex items-center justify-center py-2">
			<Drawer>
				<DrawerTrigger className="inline-flex">
					<motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
						<Button
							size="lg"
							className={cn(
								"font-semibold px-6 gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white",
								depthMode && "shadow-lg shadow-teal-500/25",
							)}
						>
							<HugeiconsIcon icon={Layout01Icon} size={17} strokeWidth={2} />
							Open Spring Drawer Shelf
						</Button>
					</motion.div>
				</DrawerTrigger>
				<DrawerContent className="max-w-xl mx-auto border-t border-teal-500/30 bg-background/95 backdrop-blur-xl">
					<DrawerHeader className="text-left">
						<div className="flex items-center gap-2">
							<Badge
								variant="outline"
								className="text-[10px] px-2 py-0 border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-500/10"
							>
								Rabtx Shelf
							</Badge>
							<DrawerTitle className="text-lg font-bold">
								Production Ready Component Drawer
							</DrawerTitle>
						</div>
						<DrawerDescription className="text-xs text-muted-foreground">
							Smooth bottom sheet with spring physics and backdrop blur overlay.
						</DrawerDescription>
					</DrawerHeader>

					<div className="p-4 space-y-3">
						<Card className="p-4 border-border/60 bg-muted/30 space-y-2">
							<div className="text-xs font-semibold text-foreground flex items-center gap-2">
								<HugeiconsIcon
									icon={CheckmarkCircle02Icon}
									size={16}
									strokeWidth={2}
									className="text-teal-500"
								/>
								Accessibility & Mobile Touch Ready
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Fully keyboard accessible with drag-to-dismiss support on touch screens.
							</p>
						</Card>
					</div>

					<DrawerFooter className="flex-row justify-end gap-2 border-t border-border/40">
						<DrawerClose>
							<Button variant="outline" size="sm" className="h-8 text-xs font-medium">
								Close Shelf
							</Button>
						</DrawerClose>
						<Button
							size="sm"
							className="h-8 text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700"
						>
							Confirm Action
						</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		</div>
	);
}

// ==========================================
// 7. RABTX PRODUCTION METRICS BLOCK DEMO
// ==========================================
export function RabtxMetricsDeckBlock({ depthMode }: { depthMode: boolean }) {
	return (
		<div className="w-full max-w-2xl py-2">
			<Card
				className={cn(
					"border-teal-500/30 bg-gradient-to-br from-card via-card to-teal-500/5 transition-all duration-300 overflow-hidden",
					depthMode &&
						"shadow-[0_20px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_45px_rgba(0,0,0,0.45)] border-t border-l border-teal-500/40",
				)}
			>
				<CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/40">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<Badge
								variant="outline"
								className="text-[10px] font-mono px-2 py-0 border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-500/10"
							>
								PRO BLOCK
							</Badge>
							<CardTitle className="text-base font-bold">Metrics Command Deck</CardTitle>
						</div>
						<CardDescription className="text-xs">
							Real-time component metric telemetry with depth indicators.
						</CardDescription>
					</div>
					<Button variant="outline" size="sm" className="h-8 text-xs font-medium gap-1.5">
						<HugeiconsIcon icon={SparklesIcon} size={13} strokeWidth={2} />
						Refresh
					</Button>
				</CardHeader>

				<CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
					<div className="p-3 rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 space-y-1">
						<span className="text-[11px] font-medium text-muted-foreground">Active Elements</span>
						<div className="text-xl font-extrabold text-foreground tracking-tight">64 Ready</div>
						<div className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1">
							<span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
							100% Type Checked
						</div>
					</div>

					<div className="p-3 rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 space-y-1">
						<span className="text-[11px] font-medium text-muted-foreground">Motion FPS</span>
						<div className="text-xl font-extrabold text-foreground tracking-tight">60.0 FPS</div>
						<div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
							<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
							GPU Hardware Accelerated
						</div>
					</div>

					<div className="p-3 rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 space-y-1">
						<span className="text-[11px] font-medium text-muted-foreground">Depth Tier</span>
						<div className="text-xl font-extrabold text-foreground tracking-tight">Spatial 3D</div>
						<div className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold flex items-center gap-1">
							<span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
							Glassmorphism 2.0
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
