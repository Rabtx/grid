export type PreviewTarget = {
	href: string;
	host: string;
	/** False when the browser would block it inside the page: http framed by an https Grid. */
	frameable: boolean;
};

/**
 * The address of a port the thread's shell serves, as seen from this browser: the same host Grid
 * was opened on (this machine, or its address on the network from a phone), on that port. Dev
 * servers speak plain http.
 */
export function previewUrl(
	location: Pick<Location, "protocol" | "hostname">,
	port: number,
): PreviewTarget {
	// Browsers already bracket an IPv6 `hostname`; a bare one is bracketed here.
	const bare = location.hostname;
	const hostname = bare.includes(":") && !bare.startsWith("[") ? `[${bare}]` : bare;
	const host = `${hostname}:${port}`;
	return {
		href: `http://${host}/`,
		host,
		frameable: location.protocol !== "https:",
	};
}
