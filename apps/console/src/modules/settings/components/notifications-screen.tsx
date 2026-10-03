import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";

import {
	Alert,
	Button,
	ChannelCell,
	ChannelRow,
	ChannelTable,
	ChatIcon,
	CheckIcon,
	Dialog,
	EyeIcon,
	LinkButton,
	notify,
	PullRequestIcon,
	Select,
	SettingsGroup,
	SettingsLinkRow,
	SettingsRow,
	Skeleton,
	Spinner,
	Switch,
	TerminalIcon,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { useShell } from "@/modules/shell";

import { ago, LOCAL_ZONE } from "../lib/devices";
import {
	accountService,
	type Channels,
	type NotifyKind,
	type PersonPrefs,
	type PrefsPatch,
	type PushDevice,
} from "../services/account.service";
import {
	currentSubscription,
	enablePush,
	pushSupport,
	type PushSupport,
	sendTestPush,
	thisDeviceId,
} from "../services/push.service";

import { SettingsPage, settingsMenu } from "./settings-page";

const KINDS: { kind: NotifyKind; label: string; description: string; icon: () => JSX.Element }[] = [
	{
		kind: "approvals",
		label: "Approvals",
		description: "A command or file change is waiting on you",
		icon: () => <TerminalIcon />,
	},
	{
		kind: "questions",
		label: "Questions",
		description: "An agent is blocked on a choice only you can make",
		icon: () => <ChatIcon />,
	},
	{
		kind: "runs",
		label: "Runs",
		description: "Tasks and automations finish or fail",
		icon: () => <CheckIcon />,
	},
	{
		kind: "reviews",
		label: "Reviews",
		description: "Pull requests waiting for your review",
		icon: () => <PullRequestIcon />,
	},
	{
		kind: "following",
		label: "Following",
		description: "Changes on tasks and notes you follow",
		icon: () => <EyeIcon />,
	},
];

const CHANNELS: { channel: keyof Channels; label: string }[] = [
	{ channel: "desktop", label: "Desktop" },
	{ channel: "phone", label: "Phone" },
	{ channel: "email", label: "Email" },
];

/** The quiet hours people pick most, as "from-to". */
const RANGES = [
	{ value: "22:00-08:00", label: "10 PM – 8 AM" },
	{ value: "23:00-07:00", label: "11 PM – 7 AM" },
	{ value: "21:00-09:00", label: "9 PM – 9 AM" },
	{ value: "00:00-08:00", label: "12 AM – 8 AM" },
	{ value: "20:00-08:00", label: "8 PM – 8 AM" },
];

const BLOCKED: Record<Exclude<PushSupport, "ready">, string> = {
	unsupported: "This browser can't show notifications from Grid.",
	"needs-install":
		"On iPhone and iPad, add Grid to your Home Screen first (Share → Add to Home Screen), then turn this on from there.",
	denied: "Notifications are blocked for this site. Allow them in your browser's site settings.",
};

/** "22:00" → "10 PM", "07:30" → "7:30 AM". */
function hour(time: string): string {
	const [hours = 0, minutes = 0] = time.split(":").map(Number);
	const twelve = hours % 12 === 0 ? 12 : hours % 12;
	return `${twelve}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hours < 12 ? "AM" : "PM"}`;
}

function reason(cause: unknown): string {
	return cause instanceof Error ? cause.message : "Try again";
}

/**
 * Settings → Notifications (Figma 24): Grid pings you only when it needs you. Which kinds of
 * update reach your desktop, phone and email; quiet hours that hold them overnight; and the
 * devices they go to, each with a test.
 */
export function NotificationsScreen(): JSX.Element {
	const auth = useAuth();
	const [prefs, setPrefs] = createSignal<PersonPrefs | null>(null);
	const [devices, setDevices] = createSignal<PushDevice[] | null>(null);
	const [support, setSupport] = createSignal<PushSupport | null>(null);
	const [subscribed, setSubscribed] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [thisDevice, setThisDevice] = createSignal<string | null>(null);
	// Phones: a kind's channels, or the quiet hours, open in a sheet.
	const [open, setOpen] = createSignal<NotifyKind | "hours" | null>(null);
	const shell = useShell();

	async function load(token: string): Promise<void> {
		try {
			const [answer, list] = await Promise.all([
				accountService.prefs(token),
				accountService.devices(token).catch(() => [] as PushDevice[]),
			]);
			setPrefs(answer.prefs);
			setDevices(list);
			setError(null);
		} catch (cause) {
			setError(reason(cause));
		}
	}
	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void load(token);
		},
	);
	onSettled(() => {
		void (async () => {
			const found = await pushSupport();
			setSupport(found);
			if (found === "ready") {
				setSubscribed(Boolean(await currentSubscription()));
				setThisDevice(await thisDeviceId());
			}
		})();
	});

	async function save(patch: PrefsPatch): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			setPrefs((await accountService.updatePrefs(token, patch)).prefs);
		} catch (cause) {
			notify({ title: "Not saved", description: reason(cause) });
		}
	}

	async function turnOn(): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		try {
			await enablePush(token);
			setSubscribed(true);
			setThisDevice(await thisDeviceId());
			setDevices(await accountService.devices(token));
		} catch (cause) {
			notify({ title: "Notifications are still off", description: reason(cause) });
		} finally {
			setBusy(false);
			setSupport(await pushSupport());
		}
	}

	async function test(device: PushDevice): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			await accountService.testDevice(token, device.id);
			notify({ title: `Sent to ${device.label}`, description: "It should appear in a moment." });
		} catch (cause) {
			notify({ title: "Not sent", description: reason(cause) });
		}
	}

	async function testAll(): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			await sendTestPush(token);
			notify({ title: "Test sent", description: "It should appear on each device in a moment." });
		} catch (cause) {
			notify({ title: "Not sent", description: reason(cause) });
		}
	}

	const quiet = () => prefs()?.notify.quiet;
	const range = () => (quiet() ? `${quiet()?.from}-${quiet()?.to}` : RANGES[0].value);
	const rangeLabel = () => {
		const current = quiet();
		return current ? `${hour(current.from)} – ${hour(current.to)}` : "";
	};
	const ranges = () =>
		RANGES.some((item) => item.value === range())
			? RANGES
			: [...RANGES, { value: range(), label: rangeLabel() }];
	// Quiet hours follow your zone: one never set is taken from this browser when they go on.
	const zoneFor = (current: PersonPrefs["notify"]["quiet"]) =>
		current.timezone === "UTC" ? LOCAL_ZONE : current.timezone;

	/** "Desktop · Phone", "Email", "Off": where a kind reaches you, in a line. */
	const reach = (kind: NotifyKind) => {
		const channels = prefs()?.notify.channels[kind];
		const on = CHANNELS.filter((item) => channels?.[item.channel]).map((item) => item.label);
		return on.length ? on.join(" · ") : "Off";
	};

	/** Phones (Figma Notifications — Mobile): each kind opens its channels; this phone last. */
	const phone = (saved: PersonPrefs) => (
		<>
			<SettingsGroup title="Reach me about">
				<For each={KINDS}>
					{(item) => (
						<SettingsLinkRow
							leading={item.icon()}
							label={item.label}
							description={reach(item.kind)}
							onClick={() => setOpen(item.kind)}
						/>
					)}
				</For>
			</SettingsGroup>
			<SettingsGroup title="Quiet hours">
				<SettingsRow
					inline
					label="Quiet hours"
					description={
						<LinkButton tone="subtle" onClick={() => setOpen("hours")}>
							{rangeLabel()}
						</LinkButton>
					}
				>
					<Switch
						label="Quiet hours"
						checked={saved.notify.quiet.on}
						onChange={(on) =>
							void save({
								notify: { quiet: on ? { on, timezone: zoneFor(saved.notify.quiet) } : { on } },
							})
						}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Let approvals through"
					description="Blocked agents still reach you"
				>
					<Switch
						label="Let approvals through"
						checked={saved.notify.quiet.approvalsThrough}
						onChange={(approvalsThrough) => void save({ notify: { quiet: { approvalsThrough } } })}
					/>
				</SettingsRow>
				<SettingsRow inline label="Weekends" description="Quiet Saturday and Sunday">
					<Switch
						label="Weekends"
						checked={saved.notify.quiet.weekends}
						onChange={(weekends) => void save({ notify: { quiet: { weekends } } })}
					/>
				</SettingsRow>
			</SettingsGroup>
			<SettingsGroup title="This phone">
				<SettingsRow
					inline
					label="Approve from lock screen"
					description="Allow or deny without unlocking"
				>
					<Switch
						label="Approve from lock screen"
						checked={saved.notify.lockScreen}
						onChange={(lockScreen) => void save({ notify: { lockScreen } })}
					/>
				</SettingsRow>
				<SettingsRow
					inline
					label="Test notification"
					description={
						support() && support() !== "ready"
							? BLOCKED[support() as Exclude<PushSupport, "ready">]
							: "Check that alerts arrive"
					}
				>
					<Show
						when={subscribed() && thisDevice()}
						fallback={
							<Show when={support() === "ready"}>
								<Button size="sm" disabled={busy()} onClick={() => void turnOn()}>
									Turn on
								</Button>
							</Show>
						}
					>
						{(id) => (
							<Button
								size="sm"
								onClick={() =>
									void test({
										id: id(),
										label: "this phone",
										kind: "phone",
										createdAt: "",
									})
								}
							>
								Send
							</Button>
						)}
					</Show>
				</SettingsRow>
			</SettingsGroup>
			<Dialog
				open={open() !== null}
				onClose={() => setOpen(null)}
				title={
					open() === "hours"
						? "Quiet hours"
						: (KINDS.find((item) => item.kind === open())?.label ?? "")
				}
				description={
					open() === "hours"
						? `In ${zoneFor(saved.notify.quiet)}.`
						: KINDS.find((item) => item.kind === open())?.description
				}
			>
				<div class="divide-y divide-line">
					<Show
						when={open() !== "hours" ? (open() as NotifyKind | null) : null}
						fallback={
							<div class="py-2">
								<Select
									look="field"
									label="When it is quiet"
									value={range()}
									onChange={(value) => {
										const [from, to] = value.split("-");
										void save({ notify: { quiet: { from, to } } });
									}}
									groups={[{ options: ranges() }]}
								/>
							</div>
						}
					>
						{(kind) => (
							<For each={CHANNELS}>
								{(column) => (
									<SettingsRow inline label={column.label}>
										<Switch
											label={`${column.label} for ${kind()}`}
											checked={saved.notify.channels[kind()][column.channel]}
											onChange={(on) =>
												void save({ notify: { channels: { [kind()]: { [column.channel]: on } } } })
											}
										/>
									</SettingsRow>
								)}
							</For>
						)}
					</Show>
				</div>
			</Dialog>
		</>
	);

	return (
		<SettingsPage
			title="Notifications"
			description="Grid pings you only when it needs you. Everything else waits quietly in Inbox."
			subtitle={prefs()?.notify.quiet.on ? `Quiet ${rangeLabel()}` : undefined}
			menu={settingsMenu(
				"Notifications",
				[{ items: [{ id: "test", label: "Send a test to every device" }] }],
				() => void testAll(),
			)}
		>
			<Show when={error()}>{(message) => <Alert tone="danger" title={message()} />}</Show>
			<Show
				when={prefs()}
				fallback={
					<Show when={!error()}>
						<Skeleton class="h-80" />
					</Show>
				}
			>
				{(saved) => (
					<Show when={shell.desktop()} fallback={phone(saved())}>
						<section class="flex flex-col gap-3">
							<div>
								<h2 class="font-medium text-body-lg text-fg">Reach me about</h2>
								<Text size="caption" tone="subtle">
									Pick where each kind of update can find you.
								</Text>
							</div>
							<ChannelTable columns={CHANNELS.map((item) => item.label)}>
								<For each={KINDS}>
									{(item) => (
										<ChannelRow
											icon={item.icon()}
											label={item.label}
											description={item.description}
										>
											<For each={CHANNELS}>
												{(column) => (
													<ChannelCell>
														<Switch
															label={`${item.label} on ${column.label.toLowerCase()}`}
															checked={saved().notify.channels[item.kind][column.channel]}
															onChange={(on) =>
																void save({
																	notify: { channels: { [item.kind]: { [column.channel]: on } } },
																})
															}
														/>
													</ChannelCell>
												)}
											</For>
										</ChannelRow>
									)}
								</For>
							</ChannelTable>
						</section>

						<SettingsGroup
							title="Quiet hours"
							description="Notifications hold overnight and arrive together in the morning."
						>
							<SettingsRow
								inline
								label="Quiet hours"
								description={`${rangeLabel()} · ${zoneFor(saved().notify.quiet)}`}
							>
								<Select
									look="pill"
									label="When it is quiet"
									value={range()}
									onChange={(value) => {
										const [from, to] = value.split("-");
										void save({ notify: { quiet: { from, to } } });
									}}
									groups={[{ options: ranges() }]}
								/>
								<Switch
									label="Quiet hours"
									checked={saved().notify.quiet.on}
									onChange={(on) =>
										void save({
											notify: {
												quiet: on ? { on, timezone: zoneFor(saved().notify.quiet) } : { on },
											},
										})
									}
								/>
							</SettingsRow>
							<SettingsRow
								inline
								label="Let approvals through"
								description="Blocked agents can still reach your phone"
							>
								<Switch
									label="Let approvals through"
									checked={saved().notify.quiet.approvalsThrough}
									onChange={(approvalsThrough) =>
										void save({ notify: { quiet: { approvalsThrough } } })
									}
								/>
							</SettingsRow>
							<SettingsRow inline label="Weekends" description="Quiet all day Saturday and Sunday">
								<Switch
									label="Weekends"
									checked={saved().notify.quiet.weekends}
									onChange={(weekends) => void save({ notify: { quiet: { weekends } } })}
								/>
							</SettingsRow>
						</SettingsGroup>

						<SettingsGroup
							title="Devices"
							description="Where your phone and desktop notifications go."
						>
							<Show when={support() !== null && (support() !== "ready" || !subscribed())}>
								<SettingsRow
									inline
									label="This device"
									description={
										support() !== "ready"
											? BLOCKED[support() as Exclude<PushSupport, "ready">]
											: "Not getting notifications yet"
									}
								>
									<Show when={support() === "ready"}>
										<Button size="sm" disabled={busy()} onClick={() => void turnOn()}>
											<Show when={busy()} fallback="Turn on">
												<Spinner label="Turning on" />
											</Show>
										</Button>
									</Show>
								</SettingsRow>
							</Show>
							<For each={devices() ?? []}>
								{(device) => (
									<SettingsRow
										inline
										label={device.label}
										description={`${device.kind === "phone" ? "Phone" : "Desktop"} · added ${ago(device.createdAt)}`}
									>
										<Button size="sm" onClick={() => void test(device)}>
											Send test
										</Button>
									</SettingsRow>
								)}
							</For>
							<SettingsRow
								inline
								label="Approve from lock screen"
								description="Allow, deny or open without unlocking"
							>
								<Switch
									label="Approve from lock screen"
									checked={saved().notify.lockScreen}
									onChange={(lockScreen) => void save({ notify: { lockScreen } })}
								/>
							</SettingsRow>
							<SettingsRow
								inline
								label="Morning email digest"
								description={`8:00 AM · ${auth.user()?.email ?? "your email"}`}
							>
								<Switch
									label="Morning email digest"
									checked={saved().notify.digest}
									onChange={(digest) => void save({ notify: { digest } })}
								/>
							</SettingsRow>
						</SettingsGroup>
					</Show>
				)}
			</Show>
		</SettingsPage>
	);
}
