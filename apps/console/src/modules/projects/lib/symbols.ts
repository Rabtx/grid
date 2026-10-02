import type { LanguageSupport } from "@codemirror/language";

/** A parsed file, as the editor's parsers give it. */
type Tree = ReturnType<LanguageSupport["language"]["parser"]["parse"]>;
type SyntaxNode = Tree["topNode"];

/** A named thing in a file (a function, class, method, type) and the lines it spans, 1-based. */
export type CodeSymbol = { name: string; from: number; to: number };

/**
 * For each kind of declaration a parser names, the child node holding its name. The parsers are
 * the editor's own (CodeMirror's Lezer grammars), so reading and editing agree on what a file is.
 */
const DECLARATIONS: Record<string, string[]> = {
	// JavaScript and TypeScript.
	FunctionDeclaration: ["VariableDefinition"],
	ClassDeclaration: ["VariableDefinition"],
	MethodDeclaration: ["PropertyDefinition", "PrivatePropertyDefinition"],
	InterfaceDeclaration: ["TypeDefinition"],
	TypeAliasDeclaration: ["TypeDefinition"],
	EnumDeclaration: ["TypeDefinition", "VariableDefinition"],
	// Python.
	FunctionDefinition: ["VariableName"],
	ClassDefinition: ["VariableName"],
	// Rust.
	FunctionItem: ["BoundIdentifier"],
	StructItem: ["TypeIdentifier"],
	EnumItem: ["TypeIdentifier"],
	TraitItem: ["TypeIdentifier"],
	ImplItem: ["TypeIdentifier"],
};

/** `const roundEta = (…) => …` names its function the way a declaration does. */
const FUNCTION_VALUES = new Set(["ArrowFunction", "FunctionExpression", "ClassExpression"]);

/** The parser for a file, loaded only when a file of its kind is read; null when Grid has none. */
async function parserFor(path: string): Promise<LanguageSupport | null> {
	const name = path.toLowerCase();
	const is = (...extensions: string[]) => extensions.some((extension) => name.endsWith(extension));
	if (is(".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs")) {
		const { javascript } = await import("@codemirror/lang-javascript");
		return javascript({ typescript: is(".ts", ".tsx", ".mts", ".cts"), jsx: is(".tsx", ".jsx") });
	}
	if (is(".py")) return (await import("@codemirror/lang-python")).python();
	if (is(".rs")) return (await import("@codemirror/lang-rust")).rust();
	return null;
}

/** Line numbers for offsets in `text`. */
function lineFinder(text: string): (offset: number) => number {
	const starts = [0];
	for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1))
		starts.push(index + 1);
	return (offset) => {
		let low = 0;
		let high = starts.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (starts[mid] <= offset) low = mid;
			else high = mid - 1;
		}
		return low + 1;
	};
}

function nameIn(node: SyntaxNode, kinds: readonly string[], text: string): string | null {
	for (let child = node.firstChild; child; child = child.nextSibling) {
		if (kinds.includes(child.name)) return text.slice(child.from, child.to);
	}
	return null;
}

/** The declarations in a parsed file, outermost first. */
export function symbolsIn(tree: Tree, text: string): CodeSymbol[] {
	const lineOf = lineFinder(text);
	const found: CodeSymbol[] = [];
	tree.iterate({
		enter(ref) {
			const node = ref.node;
			let name: string | null = null;
			const kinds = DECLARATIONS[node.name];
			if (kinds) name = nameIn(node, kinds, text);
			else if (node.name === "VariableDeclaration") {
				// One binding whose value is a function: `const roundEta = (minutes) => …`.
				let binding: string | null = null;
				for (let child = node.firstChild; child; child = child.nextSibling) {
					if (child.name === "VariableDefinition") binding = text.slice(child.from, child.to);
					else if (binding && FUNCTION_VALUES.has(child.name)) {
						name = binding;
						break;
					}
				}
			}
			if (name) found.push({ name, from: lineOf(node.from), to: lineOf(node.to) });
		},
	});
	return found;
}

/** The declarations around a line, outermost first (a class, then its method). */
export function symbolsAt(symbols: readonly CodeSymbol[], line: number): CodeSymbol[] {
	return symbols.filter((symbol) => symbol.from <= line && line <= symbol.to);
}

/** A file's declarations, read with the editor's parser; empty when Grid has none for it. */
export async function fileSymbols(path: string, text: string): Promise<CodeSymbol[]> {
	const support = await parserFor(path);
	if (!support) return [];
	return symbolsIn(support.language.parser.parse(text), text);
}
