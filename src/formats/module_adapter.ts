import { FLATTEN_DELIMITER } from "../constants";
import ts from "typescript";
import type FormatAdapter from "./format_adapter";

/** The three ways a string literal can be delimited in JS/TS source. */
type QuoteChar = "\"" | "'" | "`";

/**
 * The delimiter a literal was written with, so a rewritten value can be
 * re-emitted in the same style.
 * @param literalText - the literal's source text, quotes included
 * @returns the quote character
 */
function quoteOf(literalText: string): QuoteChar {
    if (literalText[0] === "'") return "'";
    if (literalText[0] === "`") return "`";
    return "\"";
}

/**
 * One translatable string literal in the source module: its flat key,
 * the byte range of the literal *including* its quotes, the quote
 * character to re-emit with, and the decoded original value used as the
 * "unchanged" sentinel on write.
 */
type ModuleLeaf = {
    key: string;
    start: number;
    end: number;
    quote: QuoteChar;
    original: string;
};

/**
 * The module's original source text plus the located string literals.
 *
 * Nothing else about the file is modelled: `write` splices translated
 * values into the recorded ranges of the original text, so imports,
 * comments, type annotations, satisfies/as-const clauses, trailing
 * commas, and formatting all survive untouched by construction.
 */
type ModuleSidecar = {
    kind: "module";
    raw: string;
    leaves: ModuleLeaf[];
};

/**
 * Strip the wrappers that commonly sit between a declaration and its
 * object literal: parentheses, `as const` / `as Foo`, `satisfies Foo`,
 * and `<Foo>expr` casts.
 * @param node - the expression to unwrap
 * @returns the innermost expression
 */
function unwrap(node: ts.Expression): ts.Expression {
    let current = node;
    for (;;) {
        if (
            ts.isParenthesizedExpression(current) ||
            ts.isAsExpression(current) ||
            ts.isSatisfiesExpression(current) ||
            ts.isTypeAssertionExpression(current)
        ) {
            current = current.expression;
            continue;
        }

        return current;
    }
}

function asObjectLiteral(
    node: ts.Expression | undefined,
): ts.ObjectLiteralExpression | undefined {
    if (!node) return undefined;
    const inner = unwrap(node);
    return ts.isObjectLiteralExpression(inner) ? inner : undefined;
}

/**
 * True for the assignment targets a CommonJS locale module uses:
 * `module.exports = …`, `exports = …`, `exports.default = …`.
 * @param node - the left-hand side of the assignment
 * @returns whether it is a CommonJS export target
 */
function isCommonJSExportTarget(node: ts.Expression): boolean {
    if (ts.isIdentifier(node)) return node.text === "exports";
    if (!ts.isPropertyAccessExpression(node)) return false;
    const object = node.expression;
    if (!ts.isIdentifier(object)) return false;
    return (
        (object.text === "module" && node.name.text === "exports") ||
        object.text === "exports"
    );
}

/**
 * Locate the catalogue object in a locale module, in priority order:
 * `export default` / `export =`, then CommonJS `module.exports`, then
 * the first exported `const`, then — only if the file has exactly one —
 * a bare top-level `const`.
 *
 * The fallbacks matter because locale modules are written every which
 * way; the ordering keeps a file that has both a default export and
 * helper consts unambiguous.
 * @param sourceFile - the parsed module
 * @returns the catalogue object literal, or undefined if none matched
 */
function findCatalogue(
    sourceFile: ts.SourceFile,
): ts.ObjectLiteralExpression | undefined {
    const exportedConsts: ts.ObjectLiteralExpression[] = [];
    const bareConsts: ts.ObjectLiteralExpression[] = [];

    for (const statement of sourceFile.statements) {
        if (ts.isExportAssignment(statement)) {
            const object = asObjectLiteral(statement.expression);
            if (object) return object;
        }

        if (
            ts.isExpressionStatement(statement) &&
            ts.isBinaryExpression(statement.expression) &&
            statement.expression.operatorToken.kind ===
                ts.SyntaxKind.EqualsToken &&
            isCommonJSExportTarget(statement.expression.left)
        ) {
            const object = asObjectLiteral(statement.expression.right);
            if (object) return object;
        }

        if (ts.isVariableStatement(statement)) {
            const isExported = statement.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.ExportKeyword,
            );

            for (const declaration of statement.declarationList.declarations) {
                const object = asObjectLiteral(declaration.initializer);
                if (!object) continue;
                if (isExported) exportedConsts.push(object);
                else bareConsts.push(object);
            }
        }
    }

    if (exportedConsts.length > 0) return exportedConsts[0];
    if (bareConsts.length === 1) return bareConsts[0];
    return undefined;
}

/**
 * The property name as it should appear in the flat key, or undefined
 * for names we can't address statically (computed keys, spreads).
 * @param name - the property name node
 * @returns the key segment, or undefined
 */
function propertyKey(name: ts.PropertyName): string | undefined {
    if (
        ts.isIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNumericLiteral(name) ||
        ts.isNoSubstitutionTemplateLiteral(name)
    ) {
        return name.text;
    }

    return undefined;
}

function isTranslatableLiteral(
    node: ts.Expression,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/**
 * Walk the catalogue, recording every plain string literal. Values we
 * can't safely rewrite — template literals with `${}` substitutions,
 * function calls, identifier references, numbers — are skipped, which
 * leaves their original bytes untouched on write.
 * @param node - the object or array currently being walked
 * @param currentPath - key segments accumulated so far
 * @param sourceFile - the parsed module, for literal positions
 * @param flat - flat map being built
 * @param leaves - sidecar leaves being built
 */
function collect(
    node: ts.Expression,
    currentPath: string[],
    sourceFile: ts.SourceFile,
    flat: Record<string, string>,
    leaves: ModuleLeaf[],
): void {
    if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const key = propertyKey(property.name);
            if (key === undefined) continue;
            collect(
                property.initializer,
                [...currentPath, key],
                sourceFile,
                flat,
                leaves,
            );
        }

        return;
    }

    if (ts.isArrayLiteralExpression(node)) {
        for (let i = 0; i < node.elements.length; i++) {
            collect(
                node.elements[i],
                [...currentPath, String(i)],
                sourceFile,
                flat,
                leaves,
            );
        }

        return;
    }

    if (!isTranslatableLiteral(node)) return;

    const start = node.getStart(sourceFile);
    const quote = quoteOf(sourceFile.text.slice(start, node.getEnd()));

    const flatKey = currentPath.join(FLATTEN_DELIMITER);
    flat[flatKey] = node.text;
    leaves.push({
        end: node.getEnd(),
        key: flatKey,
        original: node.text,
        quote,
        start,
    });
}

/**
 * Re-encode a translated value as a source literal in the same quote
 * style the original used.
 * @param value - the literal value
 * @param quote - the quote character to wrap it in
 * @returns the literal, including its quotes
 */
function toLiteral(value: string, quote: QuoteChar): string {
    let body = value.replace(/\\/g, "\\\\");
    if (quote === "`") {
        // Real newlines are legal inside a template literal, so only the
        // delimiter and the substitution opener need escaping.
        body = body.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    } else {
        body = body
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t")
            .replace(new RegExp(quote, "g"), `\\${quote}`);
    }

    return `${quote}${body}${quote}`;
}

/**
 * Build an adapter over JavaScript/TypeScript locale modules. Both
 * registered adapters share this implementation; only the `--file-format`
 * name and claimed extensions differ.
 * @param name - the `--file-format` identifier
 * @param extensions - the file extensions to claim
 * @returns the format adapter
 */
function createModuleAdapter(
    name: string,
    extensions: readonly string[],
): FormatAdapter<ModuleSidecar> {
    return {
        extensions,
        name,

        read(raw: string): {
            flat: Record<string, string>;
            sidecar: ModuleSidecar;
        } {
            // Parsed as TS regardless of extension: TS is a superset of
            // the syntax locale modules use, so one parser covers .js,
            // .mjs, .cjs, and .ts alike.
            const sourceFile = ts.createSourceFile(
                "locale.ts",
                raw,
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.TS,
            );

            const catalogue = findCatalogue(sourceFile);
            if (!catalogue) {
                throw new Error(
                    "No translation object found. Expected `export default {…}`, `module.exports = {…}`, or an exported `const` holding an object literal.",
                );
            }

            const flat: Record<string, string> = {};
            const leaves: ModuleLeaf[] = [];
            collect(catalogue, [], sourceFile, flat, leaves);

            return { flat, sidecar: { kind: "module", leaves, raw } };
        },

        write(
            translated: Record<string, string>,
            sidecar: ModuleSidecar,
        ): string {
            // Splice back-to-front so earlier offsets stay valid.
            const ordered = [...sidecar.leaves].sort(
                (a, b) => b.start - a.start,
            );

            let out = sidecar.raw;
            for (const leaf of ordered) {
                const value = translated[leaf.key];
                // Unchanged (or skipped) values keep the original bytes,
                // including their exact escaping.
                if (value === undefined || value === leaf.original) continue;
                out =
                    out.slice(0, leaf.start) +
                    toLiteral(value, leaf.quote) +
                    out.slice(leaf.end);
            }

            return out;
        },
    };
}

export const JavaScriptAdapter = createModuleAdapter("js", [
    ".js",
    ".mjs",
    ".cjs",
] as const);

const TypeScriptAdapter = createModuleAdapter("ts", [
    ".ts",
    ".mts",
    ".cts",
] as const);

export default TypeScriptAdapter;
