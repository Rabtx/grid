import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";
import {
	Alert,
	Button,
	ConfirmDialog,
	Dialog,
	EmptyState,
	Field,
	IconButton,
	Input,
	PlusIcon,
	RestoreIcon,
	Select,
	ShipGroupLabel,
	ShipHeading,
	ShipPage,
	ShipPanelRow,
	Skeleton,
	Stack,
	Text,
	TrashIcon,
} from "@/kit";
import { ShellSlot } from "@/modules/shell";
import { operateMessage, useOperateRead } from "../lib/operate-read";
import { operateService } from "../services/operate.service";
import type { LogSource } from "../types/operate.types";

export function OperateLogs(props: { tabs: JSX.Element }): JSX.Element {
	const sources = useOperateRead(operateService.logs);
	const [selected, setSelected] = createSignal("");
	const tail = useOperateRead(
		(token, project, source) =>
			operateService.tail(token, project, (JSON.parse(source) as LogSource).name),
		() => {
			const source = sources.value()?.sources.find((source) => source.name === selected());
			return source ? JSON.stringify(source) : "";
		},
		15_000,
	);
	const [dialog, setDialog] = createSignal(false);
	const [name, setName] = createSignal("");
	const [path, setPath] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	const [saveError, setSaveError] = createSignal<string | null>(null);
	const [removing, setRemoving] = createSignal<LogSource | null>(null);
	createEffect(
		() => sources.context.key(),
		() => {
			setSelected("");
			setDialog(false);
			setRemoving(null);
			setSaving(false);
			setSaveError(null);
		},
	);
	createEffect(
		() => [sources.value(), selected()] as const,
		([view, current]) => {
			if (view && !view.sources.some((source) => source.name === current))
				setSelected(view.sources[0]?.name ?? "");
		},
	);
	const active = () => sources.value()?.sources.find((source) => source.name === selected());
	const refresh = () => {
		sources.refresh();
		tail.refresh();
	};
	function open() {
		setName("");
		setPath("");
		setSaveError(null);
		setDialog(true);
	}
	async function save() {
		const token = sources.context.token();
		if (!token || saving() || !name().trim() || !path().trim()) return;
		const ticket = sources.context.capture();
		setSaving(true);
		setSaveError(null);
		try {
			await operateService.saveLog(token, sources.context.project(), name().trim(), path().trim());
			if (!sources.context.current(ticket)) return;
			setDialog(false);
			sources.refresh();
		} catch (cause) {
			if (sources.context.current(ticket)) setSaveError(operateMessage(cause));
		} finally {
			if (sources.context.current(ticket)) setSaving(false);
		}
	}
	async function remove() {
		const token = sources.context.token();
		const source = removing();
		if (!token || !source || saving()) return;
		const ticket = sources.context.capture();
		setSaving(true);
		setSaveError(null);
		try {
			await operateService.removeLog(token, sources.context.project(), source.name);
			if (!sources.context.current(ticket)) return;
			setRemoving(null);
			sources.refresh();
		} catch (cause) {
			if (sources.context.current(ticket)) {
				setRemoving(null);
				setSaveError(operateMessage(cause));
			}
		} finally {
			if (sources.context.current(ticket)) setSaving(false);
		}
	}
	const add = () => (
		<Show when={sources.value()?.allowed}>
			<Button size="sm" icon={<PlusIcon />} onClick={open}>
				Add log source
			</Button>
		</Show>
	);
	const actions = () => (
		<>
			<IconButton label="Refresh logs" disabled={sources.loading()} onClick={refresh}>
				<RestoreIcon />
			</IconButton>
			{add()}
		</>
	);

	return (
		<>
			<ShellSlot name="crumb">Logs</ShellSlot>
			<ShellSlot name="heading">
				<Text as="h1" size="body-lg" weight="medium" tone="strong">
					Operate
				</Text>
			</ShellSlot>
			<ShellSlot name="actions">{actions()}</ShellSlot>
			<ShellSlot name="panel">
				<ShipGroupLabel>Sources</ShipGroupLabel>
				<For each={sources.value()?.sources ?? []}>
					{(source) => (
						<ShipPanelRow
							title={source.name}
							line={source.path}
							tone="neutral"
							current={source.name === selected()}
							onClick={() => setSelected(source.name)}
						/>
					)}
				</For>
			</ShellSlot>
			<ShellSlot name="trailing">
				<IconButton
					label="Refresh logs"
					disabled={sources.loading() || tail.loading()}
					onClick={refresh}
				>
					<RestoreIcon />
				</IconButton>
			</ShellSlot>
			<ShipPage>
				<ShipHeading title="Operate" meta="Project log tails" actions={actions()} />
				{props.tabs}
				<Show when={sources.error()}>
					{(reason) => (
						<Alert
							tone={sources.forbidden() ? "warning" : "danger"}
							title={sources.forbidden() ? "Production permission required" : reason()}
							children={
								sources.forbidden()
									? "Only roles with production access can configure or read project logs."
									: undefined
							}
							action={
								<Button size="sm" onClick={sources.refresh}>
									Try again
								</Button>
							}
						/>
					)}
				</Show>
				<Show when={!dialog() ? saveError() : null}>
					{(reason) => <Alert tone="danger" title={reason()} />}
				</Show>
				<Show when={sources.loading() && !sources.value()}>
					<Skeleton class="h-24 w-full" />
				</Show>
				<Show when={sources.value()}>
					{(view) => (
						<>
							<Show
								when={view().sources.length}
								fallback={
									<EmptyState
										title="No log sources"
										description="Add a project-relative .log file on a Linux runner to read its latest lines."
										action={add()}
									/>
								}
							>
								<div class="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
									<div class="min-w-0 flex-1">
										<Select
											label="Log source"
											value={selected()}
											onChange={setSelected}
											groups={[
												{
													options: view().sources.map((source) => ({
														value: source.name,
														label: source.name,
														description: source.path,
													})),
												},
											]}
										/>
									</div>
									<Show when={active()}>
										{(source) => (
											<IconButton
												label={`Remove log source ${source().name}`}
												onClick={() => {
													setSaveError(null);
													setRemoving(source());
												}}
											>
												<TrashIcon />
											</IconButton>
										)}
									</Show>
								</div>
								<Show when={active()}>
									{(source) => (
										<Text mono size="caption" tone="subtle" class="break-all">
											{source().path}
										</Text>
									)}
								</Show>
								<Show when={tail.error()}>
									{(reason) => (
										<Alert
											tone={tail.forbidden() ? "warning" : "danger"}
											title={tail.forbidden() ? "Production permission required" : reason()}
											action={
												<Button size="sm" onClick={tail.refresh}>
													Try again
												</Button>
											}
										/>
									)}
								</Show>
								<Show when={tail.loading() && !tail.value()}>
									<Skeleton class="h-40 w-full" />
								</Show>
								<Show when={tail.value()}>
									{(reading) => (
										<Stack gap={3}>
											<Text size="caption" tone="subtle">
												Read {new Date(reading().readAt).toLocaleString()} · {reading().lines} lines
												· refreshes every 15 seconds while Logs is open
											</Text>
											<Show when={reading().truncated}>
												<Alert
													tone="warning"
													title="Showing the latest bounded tail"
													children="Earlier lines or bytes were omitted. At most 200 lines are returned."
												/>
											</Show>
											<Show
												when={reading().text}
												fallback={
													<Text>
														{reading().truncated
															? "No complete lines in the bounded tail."
															: reading().bytes === 0
																? "This log file is empty."
																: "No readable lines in this log tail."}
													</Text>
												}
											>
												<Text mono lines tone="strong" class="min-w-0">
													{reading().text}
												</Text>
											</Show>
										</Stack>
									)}
								</Show>
							</Show>
							<Text size="caption" tone="subtle">
								Project files only. Redaction is best effort; configure logs intended for production
								operators. Log text is never saved in diagnostics.
							</Text>
						</>
					)}
				</Show>
			</ShipPage>
			<Show when={sources.value()?.allowed}>
				<Dialog
					open={dialog()}
					onClose={() => {
						if (!saving()) setDialog(false);
					}}
					title="Add log source"
					description="A named .log file inside this project"
					onSubmit={() => {
						if (!saving() && name().trim() && path().trim()) void save();
					}}
					footer={
						<>
							<Button disabled={saving()} onClick={() => setDialog(false)}>
								Cancel
							</Button>
							<Button
								variant="primary"
								disabled={saving() || !name().trim() || !path().trim()}
								onClick={() => void save()}
							>
								{saving() ? "Saving…" : "Save log source"}
							</Button>
						</>
					}
				>
					<Stack gap={4}>
						<Show when={saveError()}>{(reason) => <Alert tone="danger" title={reason()} />}</Show>
						<Field label="Source name" hint="Use an existing name to update its path.">
							{(id) => (
								<Input
									id={id}
									maxlength={80}
									value={name()}
									onInput={(event) => setName(event.currentTarget.value)}
									placeholder="Application"
								/>
							)}
						</Field>
						<Field
							label="Project-relative log path"
							hint="No absolute paths, hidden files, or traversal."
						>
							{(id) => (
								<Input
									id={id}
									maxlength={1024}
									value={path()}
									onInput={(event) => setPath(event.currentTarget.value)}
									placeholder="logs/application.log"
								/>
							)}
						</Field>
						<Text size="caption">
							Up to 20 sources. A Linux runner is required. Only the latest bounded tail is read.
						</Text>
					</Stack>
				</Dialog>
				<ConfirmDialog
					open={Boolean(removing())}
					title="Remove log source?"
					description="This removes the configured source. The project log file remains."
					confirm="Remove source"
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
