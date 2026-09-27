import type { JSX } from "@solidjs/web";

import { AgentMark, AutocompleteList } from "@/kit";

import { GRID, type SlashCommand } from "../lib/slash-commands";

export type SlashMenuProps = {
	commands: readonly SlashCommand[];
	selectedIndex: number;
	onSelect: (command: SlashCommand) => void;
};

/**
 * The `/` command list floating above the composer, like the `@` file list: Grid's commands
 * first, then the agent's own under its name. Picking one runs it, or writes it out with the
 * cursor after it when it needs an argument.
 */
export function SlashMenu(props: SlashMenuProps): JSX.Element {
	return (
		<AutocompleteList
			label="Commands"
			items={props.commands.map((command) => ({
				id: command.id,
				icon: command.group === GRID ? undefined : <AgentMark name={command.group} size="sm" />,
				label: `/${command.name}`,
				hint: command.argument
					? `${command.argument} — ${command.description}`
					: command.description,
				group: command.group,
			}))}
			active={props.selectedIndex}
			empty="No matching commands"
			onPick={(id) => {
				const command = props.commands.find((candidate) => candidate.id === id);
				if (command) props.onSelect(command);
			}}
		/>
	);
}
