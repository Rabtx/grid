import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import {
	Alert,
	Button,
	CopyField,
	Dialog,
	Field,
	Input,
	LinkIcon,
	RadioCards,
	Segmented,
	Spinner,
	Stack,
	Text,
} from "@/kit";

import { ROLE_HINT, ROLE_LABEL, rolesYouCanGive } from "../lib/members";
import type { CreatedInvite, CreateInviteInput, WorkspaceRole } from "../types/workspace.types";

type Mode = "link" | "email";
type InviteRole = CreateInviteInput["role"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The link to hand on, on this console's own address: the API builds its link from its configured
 * web address, which may be another app or a host people cannot reach, while the console knows
 * where it is being used (localhost, the network, a tunnel).
 */
function linkFor(invite: CreatedInvite): string {
	return `${window.location.origin}/invite/${encodeURIComponent(invite.token)}`;
}

/**
 * Inviting someone: a link to pass on, or an email the invite is sent to, and the role they join
 * with. Once made, the link shows once to copy — Grid keeps only its hash. Links work once and
 * last seven days.
 */
export function InviteSheet(props: {
	workspaceName: string;
	me: WorkspaceRole;
	busy: boolean;
	error: string | null;
	created: CreatedInvite | null;
	onClose: () => void;
	onCreate: (input: CreateInviteInput) => void;
	onAnother: () => void;
}): JSX.Element {
	const [mode, setMode] = createSignal<Mode>("link");
	const [email, setEmail] = createSignal("");
	const [role, setRole] = createSignal<InviteRole>("member");
	const roles = () =>
		rolesYouCanGive(props.me)
			.filter((value): value is InviteRole => value !== "owner")
			.map((value) => ({ value, label: ROLE_LABEL[value], description: ROLE_HINT[value] }));
	const ready = () => mode() === "link" || EMAIL.test(email().trim());

	function create(): void {
		if (!ready() || props.busy) return;
		props.onCreate(mode() === "email" ? { email: email().trim(), role: role() } : { role: role() });
	}

	return (
		<Dialog
			open={true}
			title="Invite people"
			description={`They join ${props.workspaceName} with the role you choose.`}
			onClose={props.onClose}
			footer={
				<Show
					when={props.created}
					fallback={
						<>
							<Button onClick={props.onClose}>Cancel</Button>
							<Button variant="primary" disabled={!ready() || props.busy} onClick={create}>
								<Show
									when={props.busy}
									fallback={mode() === "email" ? "Send invite" : "Create link"}
								>
									<Spinner /> Creating…
								</Show>
							</Button>
						</>
					}
				>
					<Button onClick={props.onAnother}>Invite another</Button>
					<Button variant="primary" onClick={props.onClose}>
						Done
					</Button>
				</Show>
			}
		>
			<Show
				when={props.created}
				fallback={
					<Stack gap={4}>
						<Show when={props.error}>{(message) => <Alert tone="danger" title={message()} />}</Show>
						<Segmented<Mode>
							label="How to invite"
							block
							options={[
								{ value: "link", label: "Invite link" },
								{ value: "email", label: "By email" },
							]}
							value={mode()}
							onChange={setMode}
						/>
						<Show when={mode() === "email"}>
							<Field label="Email" hint="Only this address can use the invite.">
								{(id) => (
									<Input
										id={id}
										type="email"
										autocomplete="off"
										placeholder="name@company.com"
										value={email()}
										onInput={(event) => setEmail(event.currentTarget.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") create();
										}}
									/>
								)}
							</Field>
						</Show>
						<RadioCards label="Role" options={roles()} value={role()} onChange={setRole} />
					</Stack>
				}
			>
				{(invite) => (
					<Stack gap={3}>
						<Text>
							{invite().email
								? `Sent to ${invite().email}. They can also open this link:`
								: "Anyone with this link can join:"}
						</Text>
						<CopyField
							value={linkFor(invite())}
							label="Invite link"
							icon={<LinkIcon size="sm" />}
							mono
						/>
						<Text size="caption" tone="subtle">
							Joins as {ROLE_LABEL[invite().role].toLowerCase()}. Works once and expires in 7 days.
							This is the only time the link is shown.
						</Text>
					</Stack>
				)}
			</Show>
		</Dialog>
	);
}
