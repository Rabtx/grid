import Image from "next/image";
import { cn } from "@/lib/utils";

const FRAMES = {
	desktop: { width: 1600, height: 1000, sizes: "(min-width: 768px) 720px, calc(100vw - 32px)" },
	phone: { width: 600, height: 1298, sizes: "(min-width: 640px) 220px, 45vw" },
	wide: { width: 2000, height: 1424, sizes: "(min-width: 768px) 720px, calc(100vw - 32px)" },
} as const;

/**
 * A screenshot from `public/blog/<dir>`. A themed shot ships as `<name>-light` and `<name>-dark`
 * and the one matching the site's theme shows; an unthemed design ships as one `<name>` file.
 * Phone shots sit in a narrower, rounder frame.
 */
export function PostFigure({
	dir,
	name,
	alt,
	caption,
	frame = "desktop",
	themed = true,
	className,
}: {
	dir: string;
	name: string;
	alt: string;
	caption?: string;
	frame?: keyof typeof FRAMES;
	themed?: boolean;
	className?: string;
}) {
	const { width, height, sizes } = FRAMES[frame];
	const shared = { width, height, sizes, alt };
	return (
		<figure className={cn("min-w-0", className)}>
			<div
				className={cn(
					"overflow-hidden border border-border bg-card p-1",
					frame === "phone" ? "rounded-[22px]" : "rounded-xl sm:p-1.5",
				)}
			>
				<div
					className={cn(
						"overflow-hidden border border-border/60",
						frame === "phone" ? "rounded-[18px]" : "rounded-lg",
					)}
				>
					{themed ? (
						<>
							<Image
								src={`/blog/${dir}/${name}-light.webp`}
								{...shared}
								className="block h-auto w-full dark:hidden"
							/>
							<Image
								src={`/blog/${dir}/${name}-dark.webp`}
								{...shared}
								className="hidden h-auto w-full dark:block"
							/>
						</>
					) : (
						<Image src={`/blog/${dir}/${name}.webp`} {...shared} className="block h-auto w-full" />
					)}
				</div>
			</div>
			{caption ? (
				<figcaption className="mt-3 text-[13px] text-muted-foreground leading-5">
					{caption}
				</figcaption>
			) : null}
		</figure>
	);
}
