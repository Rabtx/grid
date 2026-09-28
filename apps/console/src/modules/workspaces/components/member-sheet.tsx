import type { JSX } from "@solidjs/web";
import { createSignal, Show, untrack } from "solid-js";

import {
	Alert,
	Avatar,
	Button,
	DescriptionList,
	Dialog,
	RadioCards,
	Row,
	Spinner,
	Stack,
	Text,
} from "@/kit";

import { memberName, ROLE_HINT, ROLE_LABEL, rolesYouCanGive } from "../lib/members";
import type { Member, WorkspaceRole } from "../types/workspace.types";

const JOINED = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	year: "numeric",
});

/**
 * One person in the workspace, opened from the members list. Someone you may manage shows their
 * role as a choice and a way to remove them; yourself, a way to leave; anyone else, who they are.
 * A bottom sheet on phones.
 */
export function MemberSheet(props: {
	member: Member;
	me: WorkspaceRole;
	isYou: boolean;
	canManage: boolean;
	busy: boolean;
	error: string | null;
	onClose: () => void;
	onSave: (role: WorkspaceRole) => void;
	onRemove: () => void;
	onLeave: () => void;
}): JSX.Element {
	const [role, setRole] = createSignal<WorkspaceRole>(untrack(() => props.member.role));
	const options = () =>
		rolesYouCanGive(props.me).map((value) => ({
			value,
			label: ROLE_LABEL[value],
			description: ROLE_HINT[value],
		}));

	return (
		<Dialog
			open={true}
			title={memberName(props.member)}
			description={`@${props.member.username}`}
			onClose={props.onClose}
			footer={
				<Show
					when={props.canManage}
					fallback={
						<Show when={props.isYou} fallback={<Button onClick={props.onClose}>Close</Button>}>
							<Button variant="danger" disabled={props.busy} onClick={props.onLeave}>
								Leave workspace
							</Button>
						</Show>
					}
				>
					<Button variant="danger" disabled={props.busy} onClick={props.onRemove}>
						Remove from workspace
					</Button>
					<Button
						variant="primary"
						disabled={props.busy || role() === props.member.role}
						onClick={() => props.onSave(role())}
					>
						<Show when={props.busy} fallback="Save role">
							<Spinner /> Saving…
						</Show>
					</Button>
				</Show>
			}
		>
			<Stack gap={4}>
				<Show when={props.error}>{(message) => <Alert tone="danger" title={message()} />}</Show>
				<Row gap={3}>
					<Avatar name={memberName(props.member)} size="lg" />
					<Text tone="subtle">
						{props.isYou ? "You · " : ""}Joined {JOINED.format(Date.parse(props.member.joinedAt))}
					</Text>
				</Row>
				<Show
					when={props.canManage}
					fallback={
						<DescriptionList
							items={[
								{ label: "Role", value: ROLE_LABEL[props.member.role] },
								{ label: "Can do", value: ROLE_HINT[props.member.role] },
							]}
						/>
					}
				>
					<RadioCards label="Role" options={options()} value={role()} onChange={setRole} />
				</Show>
			</Stack>
		</Dialog>
	);
}
