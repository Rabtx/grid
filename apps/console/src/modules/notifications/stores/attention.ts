import { createSignal, untrack } from "solid-js";

import { placementsStore } from "@/modules/environments";
import { type InboxItem, inboxStore } from "@/modules/inbox";

import { attentionService, type Waiting } from "../services/attention.service";

export type WaitingHere = Waiting & { scope: string; key: string; since: number };
const APPROVALS_EVERY_MS = 4_000;
const INBOX_EVERY_MS = 20_000;
const ARRIVAL_MS = 8_000;
const [waiting, setWaiting] = createSignal<WaitingHere[]>([]);
const [arrivals, setArrivals] = createSignal<InboxItem[]>([]);
const [hidden, setHidden] = createSignal<ReadonlySet<string>>(new Set());
const keyOf = (scope: string, item: Waiting) => `${scope}:${item.sessionId}:${item.approval.id}`;
let generation = 0;
let stopping: (() => void) | null = null;
const answered = new Set<string>();

export const attentionStore = {
	waiting,
	arrivals,
	hidden,
	/** Poll only while visible. Disposal clears account state and invalidates in-flight reads. */
	start(token: string): () => void {
		stopping?.();
		const ticket = ++generation;
		const current = () => ticket === generation;
		let approvalsBusy = false;
		let inboxBusy = false;
		let seen: Set<string> | null = untrack(inboxStore.loaded)
			? new Set(untrack(inboxStore.items).map((item) => item.id))
			: null;
		const expiry = new Set<ReturnType<typeof setTimeout>>();
		async function approvals(): Promise<void> {
			if (!current() || approvalsBusy || document.visibilityState !== "visible") return;
			approvalsBusy = true;
			try {
				const scopes = untrack(placementsStore.scopes);
				const answers = await Promise.all(
					scopes.map((scope) =>
						attentionService.waiting(token, scope).then(
							(list) => list.map((item) => ({ ...item, scope })),
							() => null,
						),
					),
				);
				if (!current()) return;
				const previous = untrack(waiting);
				const before = new Map(previous.map((item) => [item.key, item]));
				const next = answers.flatMap((list, index) =>
					(list ?? previous.filter((item) => item.scope === scopes[index])).map((item) => {
						const key = keyOf(item.scope, item);
						return { ...item, key, since: before.get(key)?.since ?? Date.now() };
					}),
				);
				setWaiting(next.filter((item) => !answered.has(item.key)));
				const present = new Set(next.map((item) => item.key));
				setHidden((keys) => new Set([...keys].filter((key) => present.has(key))));
			} finally {
				approvalsBusy = false;
			}
		}
		async function inbox(): Promise<void> {
			if (!current() || inboxBusy || document.visibilityState !== "visible") return;
			inboxBusy = true;
			try {
				await inboxStore.load(token);
				if (!current() || untrack(inboxStore.error)) return;
				const items = untrack(inboxStore.items);
				const fresh =
					seen === null
						? []
						: items.filter(
								(item) => !seen?.has(item.id) && item.kind !== "approval" && item.readAt === null,
							);
				seen = new Set([...(seen ?? []), ...items.map((item) => item.id)]);
				if (!fresh.length) return;
				setArrivals((list) => [...fresh, ...list].slice(0, 3));
				for (const item of fresh) {
					const timer = setTimeout(() => {
						expiry.delete(timer);
						if (current()) attentionStore.dropArrival(item.id);
					}, ARRIVAL_MS);
					expiry.add(timer);
				}
			} finally {
				inboxBusy = false;
			}
		}
		void approvals();
		void inbox();
		const timers = [
			setInterval(() => void approvals(), APPROVALS_EVERY_MS),
			setInterval(() => void inbox(), INBOX_EVERY_MS),
		];
		const onVisible = () => {
			void approvals();
			void inbox();
		};
		document.addEventListener("visibilitychange", onVisible);
		const stop = () => {
			if (!current()) return;
			generation++;
			for (const timer of [...timers, ...expiry]) clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisible);
			setWaiting([]);
			setArrivals([]);
			setHidden(new Set<string>());
			answered.clear();
			stopping = null;
		};
		stopping = stop;
		return stop;
	},
	async answer(token: string, item: WaitingHere, optionId: string): Promise<void> {
		const ticket = generation;
		await attentionService.approve(token, item.scope, item.sessionId, item.approval.id, optionId);
		if (ticket !== generation) return;
		answered.add(item.key);
		setWaiting((list) => list.filter((row) => row.key !== item.key));
	},
	hide(key: string): void {
		setHidden((set) => new Set([...set, key]));
	},
	dropArrival(id: string): void {
		setArrivals((list) => list.filter((row) => row.id !== id));
	},
};
