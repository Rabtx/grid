import type { JSX } from "@solidjs/web";

import { Segmented, SettingsRow } from "@/kit";
import { useShell } from "@/modules/shell";

import { RULE_OPTIONS } from "../lib/connectors";
import type { Capability, Rule } from "../types/connector.types";

/** One kind of action on a service: what it is, and Allow · Ask me · Never (full width on phones). */
export function RuleRow(props: {
	capability: Capability;
	value: Rule;
	disabled?: boolean;
	onChange: (rule: Rule) => void;
}): JSX.Element {
	const shell = useShell();
	return (
		<SettingsRow label={props.capability.label} description={props.capability.hint ?? undefined}>
			<Segmented<Rule>
				label={props.capability.label}
				size="sm"
				block={!shell.desktop()}
				value={props.value}
				onChange={(rule) => {
					if (!props.disabled) props.onChange(rule);
				}}
				options={RULE_OPTIONS}
			/>
		</SettingsRow>
	);
}
