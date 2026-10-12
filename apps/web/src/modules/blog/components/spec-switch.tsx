"use client";

import { useState } from "react";
import { CHEAT_SHEET } from "../data/cheat-sheet.data";

const { width, height, thumb, track } = CHEAT_SHEET.switch;
const inset = (height - thumb) / 2;

/** The cheat sheet's switch at its exact size, live, so the on and off states can be compared. */
export function SpecSwitch({ label }: { label: string }) {
	const [on, setOn] = useState(true);
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			onClick={() => setOn((value) => !value)}
			// The 24×14 control keeps a 44px hit area around it for touch.
			className="-mx-2.5 -my-[15px] inline-flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-[#0077E6] focus-visible:outline-offset-[-8px]"
		>
			<span
				aria-hidden
				className="relative inline-block rounded-full transition-colors duration-150 ease-out"
				style={{ width, height, backgroundColor: on ? track : "#D4D4D4" }}
			>
				<span
					className="absolute rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform duration-150 ease-out"
					style={{
						width: thumb,
						height: thumb,
						top: inset,
						left: inset,
						transform: on ? `translateX(${width - thumb - inset * 2}px)` : undefined,
					}}
				/>
			</span>
		</button>
	);
}
