/**
 * A stand-in for the `gh` CLI in the sign-in test: it prints a line whose non-ASCII characters
 * are deliberately split across two writes, the way a real process's output lands in chunks that
 * do not line up with characters. FAKE_GH_TEXT says what to print.
 *
 * The device code and the paste-back token this carries are typed by hand, so a character the
 * runner mangles is a code the person cannot enter.
 */
const text = process.env.FAKE_GH_TEXT ?? "";
const bytes = new TextEncoder().encode(text);
// Cut one byte into the first multi-byte character, which is the case a per-chunk decode gets
// wrong: the first read ends holding half of it.
const lead = [...bytes].findIndex((byte) => byte >= 0xc0);
const at = lead >= 0 ? lead + 1 : Math.max(1, bytes.length - 1);
process.stdout.write(bytes.slice(0, at));
setTimeout(() => {
	process.stdout.write(bytes.slice(at));
	process.exit(0);
}, 20);
