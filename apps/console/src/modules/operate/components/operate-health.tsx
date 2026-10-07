import { useMatch } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	AlertIcon,
	Badge,
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
	ShipPanelRow,
	ShipGroupLabel,
	ShipRows,
	ShipSectionTitle,
	Skeleton,
	Stack,
	Text,
	TextLink,
	TrashIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { now } from "@/lib/clock";
import { useAuth } from "@/modules/auth";
import { placementsStore } from "@/modules/environments";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { ShellSlot } from "@/modules/shell";

import { observedState, percent, STATE_LABEL, STATE_TONE } from "../lib/operate-look";
import { operateService } from "../services/operate.service";
import type { OperateOverview, OperateService } from "../types/operate.types";

function message(cause: unknown): string {
	return cause instanceof Error ? cause.message : "Operate did not answer";
}

/** Operational health uses the approved Ship health strip and timeline composition. */
export function OperateHealth(props: { tabs: JSX.Element }): JSX.Element {
	const auth = useAuth();
	const match = useMatch(() => "/operate/:slug");
	const project = () => match()?.params.slug ?? "";
	// scopeOf deliberately untracks placements; read its signal here to follow late placements.
	const scope = () => {
		placementsStore.placements();
		return placementsStore.scopeOf(project());
	};
	const [overview, setOverview] = createSignal<OperateOverview | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [loading, setLoading] = createSignal(false);
	let read = () => {};
	const [dialog, setDialog] = createSignal(false);
	const [name, setName] = createSignal("");
	const [url, setUrl] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	const [saveError, setSaveError] = createSignal<string | null>(null);
	const [removing, setRemoving] = createSignal<OperateService | null>(null);
	let generation = 0;

	createEffect(
		() => [auth.token(), project(), scope()] as const,
		([token, slug]) => {
			const ticket = ++generation;
			let latest = 0;
			setOverview(null);
			setError(null);
			setDialog(false);
			setRemoving(null);
			setSaving(false);
			if (!token || !slug) {
				setLoading(false);
				return;
			}
			async function load(): Promise<void> {
				const request = ++latest;
				setLoading(true);
				try {
					const next = await operateService.overview(token as string, slug);
					if (ticket !== generation || request !== latest) return;
					setOverview(next);
					setError(null);
				} catch (cause) {
					if (ticket !== generation || request !== latest) return;
					// A failed read cannot leave yesterday's healthy status on screen.
					setOverview(null);
					setError(message(cause));
				} finally {
					if (ticket === generation && request === latest) setLoading(false);
				}
			}
			void load();
			// Not while the tab is hidden: a background tab read the API every 30 seconds for nothing.
			// Coming back reads at once.
			const timer = setInterval(() => {
				if (document.visibilityState === "visible") void load();
			}, 30_000);
			const returned = () => {
				if (document.visibilityState === "visible") void load();
			};
			document.addEventListener("visibilitychange", returned);
			const refresh = () => void load();
			read = refresh;
			return () => {
				generation++;
				clearInterval(timer);
				document.removeEventListener("visibilitychange", returned);
				read = () => {};
			};
		},
	);
	const refresh = () => read();
	const state = (service: OperateService) => observedState(service, now());
	const openIncidents = () =>
		overview()?.incidents.filter((incident) => incident.status === "open").length ?? 0;
	const openDialog = () => {
		setName("");
		setUrl("");
		setSaveError(null);
		setDialog(true);
	};
	async function save(): Promise<void> {
		const token = auth.token();
		if (!token || saving() || !name().trim() || !url().trim()) return;
		const ticket = generation;
		setSaving(true);
		setSaveError(null);
		try {
			await operateService.save(token, project(), name().trim(), url().trim());
			if (ticket !== generation) return;
			setDialog(false);
			refresh();
		} catch (cause) {
			if (ticket === generation) setSaveError(message(cause));
		} finally {
			if (ticket === generation) setSaving(false);
		}
	}
	async function remove(): Promise<void> {
		const token = auth.token();
		const service = removing();
		if (!token || !service || saving()) return;
		const ticket = generation;
		setSaving(true);
		try {
			await operateService.remove(token, project(), service.name);
			if (ticket !== generation) return;
			setRemoving(null);
			refresh();
		} catch (cause) {
			if (ticket === generation) {
				setRemoving(null);
				setError(message(cause));
			}
		} finally {
			if (ticket === generation) setSaving(false);
		}
	}
	const add = () => (
		<Show when={overview()?.allowed}>
			<Button size="sm" onClick={openDialog} icon={<PlusIcon />}>
				Monitor service
			</Button>
		</Show>
	);
	const time = (at: string | null) => (at ? relativeTime(at) : "None yet");

	return (
		<>
			<ShellSlot name="crumb">Health</ShellSlot>
			<ShellSlot name="heading">
				<Text as="h1" size="body-lg" weight="medium" tone="strong">
					Operate
				</Text>
			</ShellSlot>
			<ShellSlot name="actions">{add()}</ShellSlot>
			<ShellSlot name="trailing">
				<IconButton label="Refresh Operate" disabled={loading()} onClick={refresh}>
					<RestoreIcon />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="panel">
				<ShipGroupLabel>Services</ShipGroupLabel>
				<For each={overview()?.services ?? []}>
					{(service) => (
						<ShipPanelRow
							href={`${workspaceHref(`/operate/${project()}`)}#service-${encodeURIComponent(service.id)}`}
							title={service.name}
							line={STATE_LABEL[state(service)]}
							tone={STATE_TONE[state(service)]}
						/>
					)}
				</For>
				<ShipGroupLabel>Incidents</ShipGroupLabel>
				<ShipPanelRow
					href={`${workspaceHref(`/operate/${project()}`)}#incidents`}
					title="Incident history"
					line={`${openIncidents()} open`}
					tone={openIncidents() ? "danger" : "neutral"}
				/>
			</ShellSlot>
			<ShipPage>
				<ShipHeading title="Operate" meta="Service health and incident history" actions={add()} />
				{props.tabs}
				<Show when={error()}>
					{(reason) => (
						<Alert
							tone="danger"
							title={reason()}
							action={
								<Button size="sm" onClick={refresh}>
									Try again
								</Button>
							}
						/>
					)}
				</Show>
				<Show
					when={overview()}
					fallback={
						<Show when={loading()}>
							<Skeleton class="h-24 w-full" />
							<Skeleton class="h-40 w-full" />
						</Show>
					}
				>
					{(view) => (
						<>
							<HealthStrip>
								<HealthCell
									label="Healthy services"
									value={`${view().services.filter((service) => state(service) === "healthy").length} / ${view().services.length}`}
									note="Fresh checks only"
								/>
								<HealthCell
									label="Open incidents"
									value={String(openIncidents())}
									note="Outages awaiting recovery"
								/>
								<HealthCell
									label="Latest check"
									value={time(view().checkedAt)}
									note="From the monitoring runner"
								/>
								<HealthCell
									label="Check interval"
									value={`${view().intervalSeconds}s`}
									note="Continues with the browser closed"
								/>
							</HealthStrip>
							<Show
								when={view().services.length}
								fallback={
									<EmptyState
										icon={<AlertIcon />}
										title="No services monitored"
										description="Add a public health endpoint, or configure a site address in Ship."
										action={add()}
									/>
								}
							>
								<For each={view().services}>
									{(service) => (
										<section
											id={`service-${encodeURIComponent(service.id)}`}
											class="flex min-w-0 scroll-mt-4 flex-col gap-3"
										>
											<div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
												<div class="flex min-w-0 flex-1 flex-col gap-1">
													<div class="flex flex-wrap items-center gap-2">
														<Text
															as="h2"
															size="body-lg"
															weight="medium"
															tone="strong"
															class="break-words"
														>
															{service.name}
														</Text>
														<Badge tone={STATE_TONE[state(service)]} dot>
															{STATE_LABEL[state(service)]}
														</Badge>
													</div>
													<TextLink
														href={service.url}
														target="_blank"
														rel="noreferrer"
														class="min-w-0 break-all"
													>
														{service.url}
													</TextLink>
												</div>
												<Show when={view().allowed}>
													<IconButton
														label={`Stop monitoring ${service.name}`}
														onClick={() => setRemoving(service)}
													>
														<TrashIcon />
													</IconButton>
												</Show>
											</div>
											<HealthStrip>
												<HealthCell
													label="Observed availability"
													value={percent(service.uptime)}
													note="Successful checks · last 24h"
												/>
												<HealthCell
													label="p95 response"
													value={service.p95 === null ? "—" : `${Math.round(service.p95)} ms`}
													note="Successful checks · last 24h"
												/>
												<HealthCell
													label="Monitoring coverage"
													value={percent(service.coverage)}
													note={`${service.checks} checks · last 24h`}
												/>
												<HealthCell
													label="Last response"
													value={
														state(service) === "unknown" || service.responseMs === null
															? "—"
															: `${Math.round(service.responseMs)} ms`
													}
													note={time(service.checkedAt)}
												/>
											</HealthStrip>
											<Text size="caption" tone="subtle">
												{state(service) === "unknown" ? "Waiting for fresh monitoring data. " : ""}
												Availability covers observed checks; monitoring gaps are unknown.
											</Text>
										</section>
									)}
								</For>
							</Show>
							<section id="incidents" class="flex scroll-mt-4 flex-col gap-3">
								<ShipSectionTitle note="Outage and recovery">Incident history</ShipSectionTitle>
								<Show when={view().incidents.length} fallback={<Text>No incidents recorded.</Text>}>
									<ShipRows>
										<For each={view().incidents}>
											{(incident) => (
												<div class="flex min-w-0 flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between md:px-5">
													<Stack gap={1} class="min-w-0">
														<Text weight="medium" tone="strong" class="break-words">
															{incident.serviceName}
														</Text>
														<Text size="caption" tone="subtle" class="break-all">
															{incident.url}
														</Text>
														<Text size="caption" tone="subtle">
															Opened {time(incident.openedAt)}
															{incident.resolvedAt
																? ` · Recovered ${time(incident.resolvedAt)}`
																: ""}
														</Text>
													</Stack>
													<Badge tone={incident.status === "resolved" ? "success" : "danger"} dot>
														{incident.status === "resolved"
															? "Recovered"
															: incident.monitoring
																? "Open"
																: "Monitoring stopped"}
													</Badge>
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
			<Show when={overview()?.allowed}>
				<Dialog
					open={dialog()}
					onClose={() => {
						if (!saving()) setDialog(false);
					}}
					title="Monitor service"
					description="Public HTTP or HTTPS health endpoint"
					onSubmit={() => {
						if (!saving() && name().trim() && url().trim()) void save();
					}}
					footer={
						<>
							<Button disabled={saving()} onClick={() => setDialog(false)}>
								Cancel
							</Button>
							<Button
								variant="primary"
								disabled={saving() || !name().trim() || !url().trim()}
								onClick={() => void save()}
							>
								{saving() ? "Saving…" : "Start monitoring"}
							</Button>
						</>
					}
				>
					<Stack gap={4}>
						<Show when={saveError()}>{(reason) => <Alert tone="danger" title={reason()} />}</Show>
						<Field label="Service name" hint="Use an existing name to update its address.">
							{(id) => (
								<Input
									id={id}
									value={name()}
									maxlength={80}
									placeholder="Production API"
									onInput={(event) => setName(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Field
							label="Health endpoint"
							hint="Public address without credentials, a query, or redirects."
						>
							{(id) => (
								<Input
									id={id}
									type="url"
									value={url()}
									placeholder="https://api.example.com/health"
									onInput={(event) => setUrl(event.currentTarget.value)}
								/>
							)}
						</Field>
						<Text size="caption">
							Three failed checks open an incident. Two successful checks resolve it. Alerts appear
							in Inbox.
						</Text>
					</Stack>
				</Dialog>
				<ConfirmDialog
					open={Boolean(removing())}
					title="Stop monitoring?"
					description="Checks will stop. Incident history remains, and open incidents will not be marked recovered."
					confirm="Stop monitoring"
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
