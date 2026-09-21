import { BoardScreen } from "@/modules/projects";

export const metadata = {
	title: "Board",
	description: "Tasks, stages and agent assignments for a project.",
};

export default function BoardPage() {
	return (
		// min-w-0: grid/flex children default to min-width:auto and can blow past the viewport
		<div className="mx-auto w-full min-w-0 max-w-[1600px] px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
			<BoardScreen />
		</div>
	);
}
