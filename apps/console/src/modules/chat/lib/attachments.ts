export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 20;
export const MAX_SESSION_ATTACHMENTS = 200;
export const MAX_SESSION_BYTES = 500 * 1024 * 1024;

export type UploadStatus = "idle" | "uploading" | "uploaded" | "error";

export type AttachedFile = {
	id: string;
	file: File;
	name: string;
	size: number;
	preview?: string;
	status: UploadStatus;
	progress: number;
	error: string | null;
	controller?: AbortController;
};

export type ProjectReference = {
	id: string;
	path: string;
};

export function isImageFile(file: File): boolean {
	return /^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.type);
}

export function validateIncomingFiles(
	incoming: readonly File[],
	currentCount: number,
): { valid: File[]; error: string | null } {
	if (currentCount + incoming.length > MAX_ATTACHMENTS_PER_MESSAGE) {
		return { valid: [], error: `Attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.` };
	}
	const oversized = incoming.find((file) => file.size > MAX_ATTACHMENT_BYTES);
	if (oversized) {
		return { valid: [], error: "Each file must be 10 MB or smaller." };
	}
	return { valid: [...incoming], error: null };
}

/**
 * Appends project file references as `@path` tokens to message text if not already present.
 */
export function appendProjectReferences(text: string, projectPaths: readonly string[]): string {
	const trimmed = text.trim();
	if (!projectPaths.length) return trimmed;

	const missing = projectPaths.filter((path) => {
		const token = `@${path}`;
		return !trimmed.includes(token);
	});

	if (!missing.length) return trimmed;
	const refText = missing.map((path) => `@${path}`).join(" ");
	return trimmed ? `${trimmed} ${refText}` : refText;
}
