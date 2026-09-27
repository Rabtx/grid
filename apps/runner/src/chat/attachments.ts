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

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 20;

export type Attachment = { id: string; name: string; size: number; mimeType: string };

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

/** Generated ids name directories; the original filename is display metadata only. */
export class AttachmentFiles {
	constructor(readonly root: string) {}

	path(session: string, id: string): string {
		if (!/^[\w-]+$/.test(session) || !/^[\w-]+$/.test(id)) throw new Error("Invalid attachment id");
		return join(this.root, session, id);
	}

	write(session: string, id: string, bytes: Uint8Array): void {
		const path = this.path(session, id);
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
		const path = resolve(this.path(session, attachment.id));
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

	remove(session: string, id?: string): void {
		rmSync(id ? this.path(session, id) : join(this.root, session), {
			recursive: true,
			force: true,
		});
	}
}
