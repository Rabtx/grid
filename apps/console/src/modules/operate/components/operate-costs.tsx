import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";
import {
	Alert,
	Button,
	ConfirmDialog,
	Dialog,
	EmptyState,
	Field,
	HealthCell,
	HealthStrip,
	IconButton,
	Input,
	PlusIcon,
	RestoreIcon,
	ShipHeading,
	ShipPage,
	ShipRows,
	ShipSectionTitle,
	Skeleton,
	Stack,
	Text,
	TrashIcon,
} from "@/kit";
import { ShellSlot } from "@/modules/shell";
import { cents, dollars, parseCents } from "../lib/operate-money";
import { operateMessage, useOperateRead } from "../lib/operate-read";
import { operateService } from "../services/operate.service";
import type { HostingCharge } from "../types/operate.types";

export function OperateCosts(props: { tabs: JSX.Element }): JSX.Element {
	const costs = useOperateRead(operateService.costs);
	const [dialog, setDialog] = createSignal(false);
	const [service, setService] = createSignal("");
	const [provider, setProvider] = createSignal("");
	const [amount, setAmount] = createSignal("");
	const [date, setDate] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	const [saveError, setSaveError] = createSignal<string | null>(null);
	const [removing, setRemoving] = createSignal<HostingCharge | null>(null);
	createEffect(
		() => costs.context.key(),
		() => {
			setDialog(false);
			setRemoving(null);
			setSaving(false);
			setSaveError(null);
		},
	);
	function open() {
		setService("");
		setProvider("");
		setAmount("");
		setDate(new Date().toISOString().slice(0, 10));
		setSaveError(null);
		setDialog(true);
	}
	const valid = () =>
		Boolean(service().trim() && provider().trim() && date() && parseCents(amount()) !== null);
	async function save() {
		const token = costs.context.token();
		const amountCents = parseCents(amount());
		if (!token || saving() || !valid() || amountCents === null) return;
		const ticket = costs.context.capture();
		setSaving(true);
		setSaveError(null);
		try {
			await operateService.recordCharge(token, costs.context.project(), {
				service: service().trim(),
				provider: provider().trim(),
				amountCents,
				date: date(),
			});
			if (!costs.context.current(ticket)) return;
			setDialog(false);
			costs.refresh();
		} catch (cause) {
			if (costs.context.current(ticket)) setSaveError(operateMessage(cause));
		} finally {
			if (costs.context.current(ticket)) setSaving(false);
		}
	}
	async function remove() {
		const token = costs.context.token();
		const charge = removing();
		if (!token || !charge || saving()) return;
		const ticket = costs.context.capture();
		setSaving(true);
		setSaveError(null);
		try {
			await operateService.removeCharge(token, costs.context.project(), charge.id);
			if (!costs.context.current(ticket)) return;
			setRemoving(null);
			costs.refresh();
		} catch (cause) {
			if (costs.context.current(ticket)) {
				setRemoving(null);
				setSaveError(operateMessage(cause));
			}
		} finally {
			if (costs.context.current(ticket)) setSaving(false);
		}
	}
	const add = () => (
		<Show when={costs.value()?.allowed}>
			<Button size="sm" icon={<PlusIcon />} onClick={open}>
				Record hosting charge
			</Button>
		</Show>
	);
	const actions = () => (
		<>
			<IconButton label="Refresh costs" disabled={costs.loading()} onClick={costs.refresh}>
				<RestoreIcon />
			</IconButton>
			{add()}
		</>
	);

	return (
		<>
			<ShellSlot name="crumb">Costs</ShellSlot>
			<ShellSlot name="heading">
				<Text as="h1" size="body-lg" weight="medium" tone="strong">
					Operate
				</Text>
			</ShellSlot>
			<ShellSlot name="actions">{actions()}</ShellSlot>
			<ShellSlot name="trailing">
				<IconButton label="Refresh costs" disabled={costs.loading()} onClick={costs.refresh}>
					<RestoreIcon />
				</IconButton>
			</ShellSlot>
			<ShipPage>
				<ShipHeading
					title="Operate"
					meta="Reported session costs and recorded hosting charges"
					actions={actions()}
				/>
				{props.tabs}
				<Show when={costs.error()}>
					{(reason) => (
						<Alert
							tone="danger"
							title={reason()}
							action={
								<Button size="sm" onClick={costs.refresh}>
									Try again
								</Button>
							}
						/>
					)}
				</Show>
				<Show when={!dialog() ? saveError() : null}>
					{(reason) => <Alert tone="danger" title={reason()} />}
				</Show>
				<Show when={costs.loading() && !costs.value()}>
					<Skeleton class="h-40 w-full" />
				</Show>
				<Show when={costs.value()}>
					{(view) => (
						<>
							<HealthStrip>
								<HealthCell
									label="Reported agent costs"
									value={dollars(view().agents.costUsd)}
									note="Across retained project sessions"
								/>
								<HealthCell
									label="Reporting coverage"
									value={`${view().agents.reportedSessions} / ${view().agents.totalSessions}`}
									note="Sessions with a provider-reported cost"
								/>
								<HealthCell
									label="Recorded hosting charges"
									value={cents(view().hosting.totalCents)}
									note="All recorded charges · USD"
								/>
							</HealthStrip>
							<section class="flex min-w-0 flex-col gap-3">
								<ShipSectionTitle note="Provider-reported">Agent costs</ShipSectionTitle>
								<Text size="caption">
									Each retained session contributes its highest reported cost. Missing costs are
									unknown. These totals cover retained sessions and are not a provider invoice or a
									monthly bill.
								</Text>
								<Show
									when={view().agents.providers.length}
									fallback={<Text>No retained project sessions.</Text>}
								>
									<ShipRows>
										<For each={view().agents.providers}>
											{(entry) => (
												<div class="flex min-w-0 flex-col gap-1 p-4 md:flex-row md:items-center md:justify-between md:px-5">
													<Text weight="medium" tone="strong" class="break-words">
														{entry.provider}
													</Text>
													<Stack gap={1}>
														<Text tabular tone="strong">
															{dollars(entry.costUsd)}
														</Text>
														<Text size="caption" tone="subtle">
															{entry.reportedSessions} / {entry.totalSessions} sessions reported
														</Text>
													</Stack>
												</div>
											)}
										</For>
									</ShipRows>
								</Show>
							</section>
							<section class="flex min-w-0 flex-col gap-3">
								<ShipSectionTitle note="Manually recorded · USD">Hosting charges</ShipSectionTitle>
								<Text size="caption">
									Charges are entered by your team; provider billing is not synced. Up to 500
									records are retained without automatic deletion.
								</Text>
								<Show
									when={view().hosting.charges.length}
									fallback={
										<EmptyState
											title="No hosting charges recorded"
											description="Record a known hosting charge to start tracking it."
											action={add()}
										/>
									}
								>
									<ShipRows>
										<For each={view().hosting.charges}>
											{(charge) => (
												<div class="flex min-w-0 flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between md:px-5">
													<Stack gap={1} class="min-w-0">
														<Text weight="medium" tone="strong" class="break-words">
															{charge.service}
														</Text>
														<Text size="caption" tone="subtle" class="break-words">
															{charge.provider} · {charge.date}
														</Text>
													</Stack>
													<div class="flex items-center justify-between gap-3">
														<Text tabular tone="strong">
															{cents(charge.amountCents)}
														</Text>
														<Show when={view().allowed}>
															<IconButton
																label={`Delete hosting charge ${charge.service} ${charge.date}`}
																onClick={() => {
																	setSaveError(null);
																	setRemoving(charge);
																}}
															>
																<TrashIcon />
															</IconButton>
														</Show>
													</div>
												</div>
											)}
										</For>
									</ShipRows>
								</Show>
							</section>
						</>
					)}
				</Show>
			</ShipPage>
			<Show when={costs.value()?.allowed}>
				<Dialog
					open={dialog()}
					onClose={() => {
						if (!saving()) setDialog(false);
					}}
					title="Record hosting charge"
					description="A known charge, entered manually in USD"
					footer={
						<>
							<Button disabled={saving()} onClick={() => setDialog(false)}>
								Cancel
							</Button>
							<Button variant="primary" disabled={saving() || !valid()} onClick={() => void save()}>
								{saving() ? "Saving…" : "Record charge"}
							</Button>
						</>
					}
				>
					<Stack gap={4}>
						<Show when={saveError()}>{(reason) => <Alert tone="danger" title={reason()} />}</Show>
						<Field label="Service">
							{(id) => (
								<Input
									id={id}
									maxlength={80}
									value={service()}
									onInput={(event) => setService(event.currentTarget.value)}
									placeholder="Production API"
								/>
							)}
						</Field>
						<Field label="Hosting provider">
							{(id) => (
								<Input
									id={id}
									maxlength={80}
									value={provider()}
									onInput={(event) => setProvider(event.currentTarget.value)}
									placeholder="Provider name"
								/>
							)}
						</Field>
						<Field
							label="Amount (USD)"
							hint="Use dollars and at most two decimal places, including 0.00."
						>
							{(id) => (
								<Input
									id={id}
									inputmode="decimal"
									value={amount()}
									onInput={(event) => setAmount(event.currentTarget.value)}
									placeholder="12.34"
								/>
							)}
						</Field>
						<Field label="Charge date">
							{(id) => (
								<Input
									id={id}
									type="date"
									value={date()}
									onInput={(event) => setDate(event.currentTarget.value)}
								/>
							)}
						</Field>
					</Stack>
				</Dialog>
				<ConfirmDialog
					open={Boolean(removing())}
					title="Delete recorded charge?"
					description={
						removing()
							? `${removing()!.service} · ${cents(removing()!.amountCents)} · ${removing()!.date}. This removes the record from Grid.`
							: ""
					}
					confirm="Delete charge"
					danger
					pending={saving()}
					stayOpen
					onConfirm={() => void remove()}
					onClose={() => {
						if (!saving()) setRemoving(null);
					}}
				/>
			</Show>
		</>
	);
}
