import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

import {
	Alert,
	Badge,
	Button,
	EmptyState,
	Select,
	SettingsGroup,
	SettingsRow,
	Skeleton,
	Stack,
	Text,
	TextLink,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { useWorkspaces } from "@/modules/workspaces";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type { Member } from "@/modules/workspaces/types/workspace.types";

import { ACTOR_KINDS, actionWords } from "../lib/audit-words";
import {
	type AuditActorKind,
	type AuditEntry,
	dollars,
	spendService,
} from "../services/spend.service";
import { SettingsPage } from "./settings-page";

const PAGE = 100;

/**
 * Settings → Audit log, for owners and admins: what agent keys, guests, webhooks, automations and
 * spending limits did in the workspace, and the changes to keys and guest links that let them,
 * newest first, each with what its thread has cost so far. Kept 90 days.
 */
export function AuditScreen(): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const [entries, setEntries] = createSignal<AuditEntry[] | null>(null);
	const [members, setMembers] = createSignal<Member[]>([]);
	const [kind, setKind] = createSignal<AuditActorKind | "">("");
	const [more, setMore] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	// The kind is passed in: a signal just set reads its old value until the next flush.
	async function load(shownKind: AuditActorKind | "", before?: string): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			const page = await spendService.audit(token, {
				...(before ? { before } : {}),
				...(shownKind ? { kind: shownKind } : {}),
			});
			setEntries((current) => (before ? [...(current ?? []), ...page] : page));
			setMore(page.length === PAGE);
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not read the audit log");
			setEntries((current) => current ?? []);
		}
	}

	onSettled(() => {
		void load("");
		const token = auth.token();
		const slug = workspaces.current()?.slug;
		if (token && slug)
			void workspacesService.members(token, slug).then(setMembers, (cause: unknown) => {
				console.warn("[audit] could not read the members:", cause);
			});
	});

	const actorName = (entry: AuditEntry) => {
		if (entry.actor.kind !== "person") return entry.actor.name;
		const member = members().find((item) => item.userId === entry.actor.id);
		return member?.displayName || member?.username || entry.actor.name;
	};

	return (
		<SettingsPage
			title="Audit log"
			description="What agent keys, guests, webhooks, automations and spending limits did here, and changes to keys and guest links. Kept 90 days."
			actions={
				<div class="w-44">
					<Select<AuditActorKind | "">
						label="Who"
						look="field"
						value={kind()}
						onChange={(next) => {
							setKind(next);
							setEntries(null);
							void load(next);
						}}
						groups={[
							{
								options: [
									{ value: "", label: "Everyone" },
									...(Object.entries(ACTOR_KINDS) as [AuditActorKind, string][]).map(
										([value, label]) => ({ value, label }),
									),
								],
							},
						]}
					/>
				</div>
			}
		>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<Show
				when={entries()}
				fallback={
					<Stack gap={2}>
						<Skeleton class="h-14" />
						<Skeleton class="h-14" />
					</Stack>
				}
			>
				{(shown) => (
					<Show
						when={shown().length > 0}
						fallback={
							<EmptyState
								title="Nothing yet"
								description="Agent keys, guests, webhooks and automations show here as they act."
							/>
						}
					>
						<SettingsGroup title="Newest first">
							<For each={shown()}>
								{(entry) => (
									<SettingsRow
										label={
											<span class="flex min-w-0 flex-wrap items-baseline gap-x-1">
												<span class="font-medium">{actorName(entry)}</span>
												<span class="text-fg-muted">{actionWords(entry.action)}</span>
												<Show when={entry.sessionId} fallback={<span>{entry.target}</span>}>
													{(id) => (
														<TextLink tone="accent" href={workspaceHref(`/thread/${id()}`)}>
															{entry.target ?? "a thread"}
														</TextLink>
													)}
												</Show>
											</span>
										}
										description={[
											`${relativeTime(entry.at)} · ${new Date(entry.at).toLocaleString()}`,
											entry.project,
											entry.detail,
										]
											.filter(Boolean)
											.join(" · ")}
									>
										<Badge>{ACTOR_KINDS[entry.actor.kind]}</Badge>
										<Show when={entry.costUsd !== null}>
											<Text size="caption" tone="subtle" tabular>
												{dollars(entry.costUsd ?? 0)}
											</Text>
										</Show>
									</SettingsRow>
								)}
							</For>
						</SettingsGroup>
						<Show when={more()}>
							<div>
								<Button variant="ghost" onClick={() => void load(kind(), shown().at(-1)?.at)}>
									Older
								</Button>
							</div>
						</Show>
					</Show>
				)}
			</Show>
		</SettingsPage>
	);
}
