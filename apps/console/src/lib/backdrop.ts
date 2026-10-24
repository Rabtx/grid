import { createSignal } from "solid-js";

/**
 * The background image for Settings → Appearance → Background: kept on this device (IndexedDB,
 * like the rest of Appearance it is not an account setting), applied to the document root as
 * `--backdrop-image` with `data-backdrop-image="on"`. Where it shows (the sidebar or the whole
 * app) and how see-through the interface is over it are ordinary Appearance settings.
 */

const DB = "grid-backdrop";
const STORE = "images";
const KEY = "current";
/** Larger images are scaled down before they are kept: a background never needs more. */
const MAX_SIDE = 2400;
/** What may be chosen. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const [has, setHas] = createSignal(false);
/** Whether this device has a background image. */
export const hasBackdropImage = has;

let url: string | null = null;

function open(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === "undefined") return Promise.resolve(null);
	return new Promise((resolve) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
	});
}

async function run<T>(
	mode: IDBTransactionMode,
	act: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
	const db = await open();
	if (!db) return null;
	try {
		return await new Promise<T | null>((resolve, reject) => {
			const request = act(db.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(request.error ?? new Error("The browser could not keep the image"));
		});
	} finally {
		db.close();
	}
}

/** Put an image (or none) on the root, for the stylesheet to draw. */
export function applyBackdropImage(
	image: Blob | null,
	root: HTMLElement = document.documentElement,
): void {
	if (url) URL.revokeObjectURL(url);
	url = image ? URL.createObjectURL(image) : null;
	if (url) root.style.setProperty("--backdrop-image", `url("${url}")`);
	else root.style.removeProperty("--backdrop-image");
	root.setAttribute("data-backdrop-image", url ? "on" : "off");
	setHas(Boolean(url));
}

/** Scale an image down to what a background needs, as a JPEG. */
async function shrink(file: Blob): Promise<Blob> {
	if (typeof createImageBitmap !== "function") return file;
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	if (scale === 1 && file.size < 4 * 1024 * 1024) {
		bitmap.close();
		return file;
	}
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return new Promise((resolve) =>
		canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.86),
	);
}

/** Keep a chosen image as this device's background and show it. */
export async function setBackdropImage(file: File): Promise<void> {
	if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
	if (file.size > MAX_FILE_BYTES) throw new Error("Choose an image under 25 MB");
	const image = await shrink(file);
	await run("readwrite", (store) => store.put(image, KEY));
	applyBackdropImage(image);
}

/** Forget the background image. */
export async function clearBackdropImage(): Promise<void> {
	await run("readwrite", (store) => store.delete(KEY));
	applyBackdropImage(null);
}

/** Show the kept image, if any; call once at start. A browser without storage just has none. */
export async function restoreBackdrop(): Promise<void> {
	try {
		const image = await run<Blob | undefined>(
			"readonly",
			(store) => store.get(KEY) as IDBRequest<Blob | undefined>,
		);
		applyBackdropImage(image instanceof Blob ? image : null);
	} catch (cause) {
		console.warn("[appearance] could not read the background image:", cause);
		applyBackdropImage(null);
	}
}
