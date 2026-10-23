/**
 * The arithmetic a calculator visual's outputs are written in: numbers, names (its inputs and the
 * outputs above), `+ - * / % ^`, parentheses, and `min max round floor ceil abs sqrt`. Parsed
 * here, never handed to `eval`: an agent wrote it, so it may only ever do arithmetic.
 */

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
	min: Math.min,
	max: Math.max,
	round: Math.round,
	floor: Math.floor,
	ceil: Math.ceil,
	abs: Math.abs,
	sqrt: Math.sqrt,
};

type Token =
	| { kind: "number"; value: number }
	| { kind: "name"; value: string }
	| { kind: "op"; value: string };

function tokens(formula: string): Token[] {
	const out: Token[] = [];
	const pattern = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/%^(),]))/y;
	let at = 0;
	while (at < formula.length) {
		if (/^\s*$/.test(formula.slice(at))) break;
		pattern.lastIndex = at;
		const match = pattern.exec(formula);
		if (!match) throw new Error(`Cannot read "${formula.slice(at).trim()}"`);
		at = pattern.lastIndex;
		if (match[1] !== undefined) out.push({ kind: "number", value: Number(match[1]) });
		else if (match[2] !== undefined) out.push({ kind: "name", value: match[2] });
		else out.push({ kind: "op", value: match[3] as string });
	}
	return out;
}

/** Work out a formula with these values for its names. Throws on anything but arithmetic. */
export function evaluate(formula: string, values: Record<string, number>): number {
	const list = tokens(formula);
	let i = 0;
	const peek = () => list[i];
	const take = (op?: string) => {
		const token = list[i];
		if (op && !(token?.kind === "op" && token.value === op)) throw new Error(`Expected ${op}`);
		i++;
		return token;
	};
	const isOp = (op: string) => {
		const token = peek();
		return token?.kind === "op" && token.value === op;
	};

	// expression: term (("+" | "-") term)*
	function expression(): number {
		let value = term();
		while (isOp("+") || isOp("-")) value = take()?.value === "+" ? value + term() : value - term();
		return value;
	}
	// term: power (("*" | "/" | "%") power)*
	function term(): number {
		let value = power();
		while (isOp("*") || isOp("/") || isOp("%")) {
			const op = take()?.value;
			const right = power();
			value = op === "*" ? value * right : op === "/" ? value / right : value % right;
		}
		return value;
	}
	// power: unary ("^" power)?, right to left
	function power(): number {
		const base = unary();
		if (!isOp("^")) return base;
		take();
		return base ** power();
	}
	function unary(): number {
		if (isOp("-")) {
			take();
			return -unary();
		}
		if (isOp("+")) {
			take();
			return unary();
		}
		return atom();
	}
	function atom(): number {
		const token = take();
		if (!token) throw new Error("The formula ends too soon");
		if (token.kind === "number") return token.value;
		if (token.kind === "op" && token.value === "(") {
			const value = expression();
			take(")");
			return value;
		}
		if (token.kind === "name") {
			const fn = FUNCTIONS[token.value];
			if (fn && isOp("(")) {
				take("(");
				const args = [expression()];
				while (isOp(",")) {
					take();
					args.push(expression());
				}
				take(")");
				return fn(...args);
			}
			if (Object.hasOwn(values, token.value)) return values[token.value] as number;
			throw new Error(`Unknown name ${token.value}`);
		}
		throw new Error(`Unexpected ${token.value}`);
	}

	const value = expression();
	if (i < list.length) throw new Error(`Unexpected ${String(list[i]?.value)}`);
	return value;
}
