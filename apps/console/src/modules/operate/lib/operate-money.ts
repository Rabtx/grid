const usd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 6,
});
export function dollars(value: number | null): string {
	return value === null ? "Unknown" : usd.format(value);
}
export function cents(value: number | null): string {
	if (value === null) return "Unknown";
	const amount = BigInt(value);
	return `$${(amount / BigInt(100)).toLocaleString("en-US")}.${String(amount % BigInt(100)).padStart(2, "0")}`;
}
/** Money stays integer cents at the mutation boundary; no parseFloat rounding. */
export function parseCents(value: string): number | null {
	if (!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return null;
	const [whole, fraction = ""] = value.split(".");
	const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
	return Number.isSafeInteger(amount) ? amount : null;
}
