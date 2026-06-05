import type FormatAdapter from "./format_adapter";

/**
 * printf-style placeholder as used in iOS format strings: `%@`, `%d`,
 * `%1$@`, `%2$d`, `%.2f`, … Capture group (1) is the optional `N$`
 * positional index. `%@` (the Objective-C object specifier) is the
 * distinguishing addition over plain printf.
 *
 * Deliberately tolerant — the contract is "whatever we strip on read we
 * restore on write", so we don't fully validate the printf grammar.
 */
const PRINTF_REGEX =
    /%(?:(\d+)\$)?[-+ #0]*\d*(?:\.\d+)?(?:hh|h|ll|l|j|z|t|L|q)?[@sdifFeEgGxXoucpn%]/g;

type PlaceholderMap = {
    /** Native tokens, one per arg slot (1-based index → tokens[i-1]). */
    tokens: string[];
    /** Whether tokens were positional (`%1$@`) or bare (`%@`). */
    positional: boolean;
};

/**
 * One chunk of the source file. `raw` chunks (comments, whitespace,
 * keys, `=`, quotes, `;`) are reproduced verbatim; `value` chunks hold
 * a single translatable string's inner content so it can be swapped.
 */
type StringsChunk =
    | { kind: "raw"; text: string }
    | {
          kind: "value";
          key: string;
          /** Original escaped inner text (without the surrounding quotes). */
          rawValue: string;
          /** Placeholder-stripped value; "unchanged" sentinel on write. */
          normalizedValue: string;
          placeholders: PlaceholderMap;
      };

type StringsSidecar = {
    kind: "strings";
    chunks: StringsChunk[];
};

/**
 * Decode `.strings` backslash escapes (`\"`, `\n`, `\Uxxxx`, …) into the
 * literal characters they represent.
 * @param s - the escaped source text
 * @returns the decoded literal string
 */
function unescapeStrings(s: string): string {
    let out = "";
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c !== "\\") {
            out += c;
            continue;
        }

        const n = s[i + 1];
        i++;
        switch (n) {
            case "n":
                out += "\n";
                break;
            case "t":
                out += "\t";
                break;
            case "r":
                out += "\r";
                break;
            case "U":
            case "u": {
                const hex = s.slice(i + 1, i + 5);
                out += String.fromCharCode(parseInt(hex, 16));
                i += 4;
                break;
            }

            // `\"`, `\\`, and anything else collapse to the bare char.
            default:
                if (n !== undefined) out += n;
                break;
        }
    }

    return out;
}

/**
 * Encode a translated value into `.strings` inner form. Only structural
 * escapes are emitted; non-ASCII stays UTF-8 (this tool writes UTF-8,
 * not legacy UTF-16). The surrounding quotes are added by the caller.
 * @param s - the literal value to encode
 * @returns the escaped inner string
 */
function escapeStringsValue(s: string): string {
    let out = "";
    for (const ch of s) {
        switch (ch) {
            case "\\":
                out += "\\\\";
                break;
            case "\"":
                out += "\\\"";
                break;
            case "\n":
                out += "\\n";
                break;
            case "\t":
                out += "\\t";
                break;
            case "\r":
                out += "\\r";
                break;
            default:
                out += ch;
        }
    }

    return out;
}

function stripPlaceholders(text: string): {
    normalized: string;
    map: PlaceholderMap;
} {
    const tokens: string[] = [];
    let positional = false;
    let autoIndex = 0;
    const normalized = text.replace(PRINTF_REGEX, (match, posIdx) => {
        if (match === "%%") return match;
        let index: number;
        if (posIdx) {
            positional = true;
            index = Number(posIdx);
        } else {
            autoIndex++;
            index = autoIndex;
        }

        tokens[index - 1] = match;
        return `{{arg${index}}}`;
    });

    return { map: { positional, tokens }, normalized };
}

function restorePlaceholders(text: string, map: PlaceholderMap): string {
    if (map.tokens.length === 0) return text;
    return text.replace(/\{\{arg(\d+)\}\}/g, (_match, idx) => {
        // A model-invented arg reference with no captured token is left
        // literal rather than silently dropped — same stance as the PO
        // and properties adapters; verification guards against it.
        const original = map.tokens[Number(idx) - 1];
        return original ?? `{{arg${idx}}}`;
    });
}

/**
 * Read a double-quoted literal starting at `raw[i]` (which must be `"`),
 * honouring backslash escapes so an escaped quote does not end it.
 * @param raw - the full source text
 * @param i - index of the opening quote
 * @returns the escaped inner content and the index just past the close
 */
function readQuoted(raw: string, i: number): { inner: string; end: number } {
    let j = i + 1;
    let inner = "";
    while (j < raw.length) {
        const c = raw[j];
        if (c === "\\") {
            inner += c + (raw[j + 1] ?? "");
            j += 2;
            continue;
        }

        if (c === "\"") break;
        inner += c;
        j++;
    }

    return { end: j + 1, inner };
}

const StringsAdapter: FormatAdapter<StringsSidecar> = {
    extensions: [".strings"] as const,
    name: "strings",

    read(raw: string): {
        flat: Record<string, string>;
        sidecar: StringsSidecar;
    } {
        const flat: Record<string, string> = {};
        const chunks: StringsChunk[] = [];

        let buf = "";
        let i = 0;
        let seenEquals = false;
        let currentKey: string | undefined;

        while (i < raw.length) {
            const c = raw[i];

            // Block comment — consumed whole so quotes inside it are inert.
            if (c === "/" && raw[i + 1] === "*") {
                const close = raw.indexOf("*/", i + 2);
                const end = close === -1 ? raw.length : close + 2;
                buf += raw.slice(i, end);
                i = end;
                continue;
            }

            // Line comment — runs to (but not including) the newline.
            if (c === "/" && raw[i + 1] === "/") {
                const nl = raw.indexOf("\n", i);
                const end = nl === -1 ? raw.length : nl;
                buf += raw.slice(i, end);
                i = end;
                continue;
            }

            if (c === "\"") {
                const { inner, end } = readQuoted(raw, i);
                if (!seenEquals || currentKey === undefined) {
                    // First quoted string of the statement is the key;
                    // keys aren't translated, so keep them verbatim.
                    buf += raw.slice(i, end);
                    if (!seenEquals) currentKey = unescapeStrings(inner);
                } else {
                    // Value: split the buffer so the inner text becomes
                    // its own replaceable chunk, with the quotes staying
                    // in the surrounding raw chunks.
                    buf += "\"";
                    chunks.push({ kind: "raw", text: buf });

                    const { normalized, map } = stripPlaceholders(
                        unescapeStrings(inner),
                    );

                    flat[currentKey] = normalized;
                    chunks.push({
                        key: currentKey,
                        kind: "value",
                        normalizedValue: normalized,
                        placeholders: map,
                        rawValue: inner,
                    });

                    buf = "\"";
                }

                i = end;
                continue;
            }

            if (c === "=") {
                seenEquals = true;
                buf += c;
                i++;
                continue;
            }

            if (c === ";") {
                seenEquals = false;
                currentKey = undefined;
                buf += c;
                i++;
                continue;
            }

            buf += c;
            i++;
        }

        if (buf) chunks.push({ kind: "raw", text: buf });

        return { flat, sidecar: { chunks, kind: "strings" } };
    },

    write(translated: Record<string, string>, sidecar: StringsSidecar): string {
        let out = "";
        for (const chunk of sidecar.chunks) {
            if (chunk.kind === "raw") {
                out += chunk.text;
                continue;
            }

            const value = translated[chunk.key];
            // Unchanged (or dropped) values re-emit the original inner
            // bytes, preserving the source's exact escaping.
            if (value === undefined || value === chunk.normalizedValue) {
                out += chunk.rawValue;
                continue;
            }

            out += escapeStringsValue(
                restorePlaceholders(value, chunk.placeholders),
            );
        }

        return out;
    },
};

export default StringsAdapter;
