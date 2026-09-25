import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileMentionPopup } from "./file-mention-popup";

describe("FileMentionPopup", () => {
	let container: HTMLElement;
	let dispose: () => void;

	afterEach(() => {
		dispose?.();
		container?.remove();
	});

	function mount(props: {
		files: string[];
		loading?: boolean;
		selectedIndex?: number;
		onSelect?: (file: string) => void;
		onClose?: () => void;
	}): void {
		container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => (
				<FileMentionPopup
					files={props.files}
					loading={props.loading ?? false}
					selectedIndex={props.selectedIndex ?? 0}
					onSelect={props.onSelect ?? (() => {})}
					onClose={props.onClose ?? (() => {})}
				/>
			),
			container,
		);
	}

	it("renders the list of file paths with file name and directory path", () => {
		mount({
			files: ["src/app.ts", "apps/console/src/main.tsx", "README.md"],
			selectedIndex: 0,
		});

		expect(container.textContent).toContain("Files (3)");
		expect(container.textContent).toContain("app.ts");
		expect(container.textContent).toContain("src");
		expect(container.textContent).toContain("main.tsx");
		expect(container.textContent).toContain("apps/console/src");
		expect(container.textContent).toContain("README.md");
	});

	it("indicates the selected item via data-selected and background styling", () => {
		mount({
			files: ["src/app.ts", "src/index.ts"],
			selectedIndex: 1,
		});

		const items = container.querySelectorAll("button[data-selected]");
		expect(items[0].getAttribute("data-selected")).toBe("false");
		expect(items[1].getAttribute("data-selected")).toBe("true");

		expect(items[1]?.className).toContain("bg-ink/10");
	});

	it("calls onSelect when an item is clicked", () => {
		const onSelect = vi.fn();
		mount({
			files: ["src/app.ts", "src/index.ts"],
			selectedIndex: 0,
			onSelect,
		});

		const button = container.querySelectorAll("button")[1]; // second item: src/index.ts
		button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

		expect(onSelect).toHaveBeenCalledWith("src/index.ts");
	});

	it("displays loading spinner and search state when loading without files", () => {
		mount({
			files: [],
			loading: true,
		});

		expect(container.textContent).toContain("Searching files…");
	});

	it("displays 'No matching files found' when files list is empty and not loading", () => {
		mount({
			files: [],
			loading: false,
		});

		expect(container.textContent).toContain("No matching files found");
	});
});
