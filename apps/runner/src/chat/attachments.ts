import {
	constants,
	closeSync,
	fstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import type { ChatAttachment } from "../agents/events";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 20;
/** What one thread may keep: enough for a long conversation, not a disk-filler. */
export const MAX_SESSION_ATTACHMENTS = 200;
export const MAX_SESSION_BYTES = 500 * 1024 * 1024;
/**
 * Images sent inline to an agent: models take up to 5 MB per image once base64-encoded (about
 * 3.75 MB raw) and a request has an overall ceiling, so larger images, or more of them, go by
 * path instead.
 */
export const MAX_IMAGE_BLOCK_BYTES = 3_750_000;
export const MAX_IMAGE_BLOCKS_BYTES = 15_000_000;

export type Attachment = ChatAttachment;

/** Only inert raster formats are served inline or sent as image blocks. Never trust a MIME header. */
export function imageType(bytes: Uint8Array): string | null {
	const b = Buffer.from(bytes);
	if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
	if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
	if (["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString())) return "image/gif";
	if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP")
		return "image/webp";
	return null;
}

/**
 * The extension a file keeps on disk, from its name: agents read files by what they end in (an
 * image, a PDF). Letters and digits only, or none.
 */
export function extensionOf(name: string): string {
	return name.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase() ?? "";
}

/** Generated ids name the files, with the name's extension; the original name is display only. */
export class AttachmentFiles {
	constructor(readonly root: string) {}

	path(session: string, attachment: Pick<Attachment, "id" | "name">): string {
		if (!/^[\w-]+$/.test(session) || !/^[\w-]+$/.test(attachment.id))
			throw new Error("Invalid attachment id");
		const extension = extensionOf(attachment.name);
		return join(this.root, session, extension ? `${attachment.id}.${extension}` : attachment.id);
	}

	write(session: string, attachment: Pick<Attachment, "id" | "name">, bytes: Uint8Array): void {
		const path = this.path(session, attachment);
		mkdirSync(join(this.root, session), { recursive: true, mode: 0o700 });
		this.checkDirectory(session);
		writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
	}

	private checkDirectory(session: string): void {
		if (realpathSync(join(this.root, session)) !== join(realpathSync(this.root), session)) {
			throw new Error("Attachment directory is not safe");
		}
	}

	verifiedPath(session: string, attachment: Attachment): string {
		const { path, fd } = this.open(session, attachment);
		closeSync(fd);
		return path;
	}

	read(session: string, attachment: Attachment): { path: string; bytes: Buffer } {
		const { path, fd } = this.open(session, attachment);
		try {
			return { path, bytes: readFileSync(fd) };
		} finally {
			closeSync(fd);
		}
	}

	private open(session: string, attachment: Attachment): { path: string; fd: number } {
		this.checkDirectory(session);
		const path = resolve(this.path(session, attachment));
		const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const stat = fstatSync(fd);
			if (!stat.isFile() || stat.size !== attachment.size || stat.size > MAX_ATTACHMENT_BYTES)
				throw new Error("Attachment changed on disk");
			return { path, fd };
		} catch (cause) {
			closeSync(fd);
			throw cause;
		}
	}

	/** One attachment's file, or with none given the whole thread's. */
	remove(session: string, attachment?: Pick<Attachment, "id" | "name">): void {
		rmSync(attachment ? this.path(session, attachment) : join(this.root, session), {
			recursive: true,
			force: true,
		});
	}
}
