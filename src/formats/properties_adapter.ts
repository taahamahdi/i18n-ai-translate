import type FormatAdapter from "./format_adapter";

/**
 * Java MessageFormat placeholder: `{0}`, `{1}`, `{0,number}`,
 * `{1,date,short}`, … Capture group (1) is the argument number.
 *
 * Deliberately tolerant and flat — it does not descend into nested
 * MessageFormat (e.g. `{0,choice,...{1}...}`) or honour single-quote
 * escaping (`'{'`). The adapter contract is only "whatever we strip on
 * read, we restore on write", so a token we don't recognise is simply
 * left untouched in both directions.
 */
const MESSAGE_FORMAT_REGEX = /\{(\d+)(?:,[^{}]*)?\}/g;

type PlaceholderMap = {
    /** Native MessageFormat tokens, indexed by their argument number. */
    tokens: string[];
};

/**
 * One logical line of the source file. A `raw` record is a comment or
 * blank line preserved verbatim; an `entry` record is a `key=value`
 * pair. `rawBlock` holds the entry's original text (possibly several
 * physical lines joined by line continuations) so an unchanged value
 * round-trips byte-for-byte; `rawKey`/`separator` are the line-one
 * prefix used to re-emit only the value when a translation differs.
 */
type PropertyRecord =
    | { kind: "raw"; text: string }
    | {
          kind: "entry";
          key: string;
          rawKey: string;
          separator: string;
          rawBlock: string;
          /** Placeholder-stripped original value; "unchanged" sentinel. */
          normalizedValue: string;
          placeholders: PlaceholderMap;
      };

/**
 * Everything needed to rebuild the .properties file after the flat map
 * round-trips through the pipeline: the ordered records (comments,
 * blanks, and entries with their original bytes) plus whether the file
 * ended in a newline.
 */
type PropertiesSidecar = {
    kind: "properties";
    records: PropertyRecord[];
    trailingNewline: boolean;
};

/**
 * True when `line` ends with an odd number of backslashes — i.e. the
 * final backslash is a line-continuation marker rather than an escape.
 * @param line - the physical line to inspect
 * @returns whether the line continues onto the next
 */
function endsWithOddBackslash(line: string): boolean {
    let count = 0;
    for (let i = line.length - 1; i >= 0 && line[i] === "\\"; i--) count++;
    return count % 2 === 1;
}

/**
 * Decode `.properties` backslash escapes (`\n`, `\t`, `\uXXXX`, `\=`, …)
 * into the literal characters they represent.
 * @param s - the escaped source text
 * @returns the decoded literal string
 */
function unescapeProperties(s: string): string {
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
            case "f":
                out += "\f";
                break;
            case "u": {
                const hex = s.slice(i + 1, i + 5);
                out += String.fromCharCode(parseInt(hex, 16));
                i += 4;
                break;
            }

            // `\=`, `\:`, `\#`, `\!`, `\\`, `\ `, … collapse to the bare
            // character. `undefined` (a trailing lone backslash) drops.
            default:
                if (n !== undefined) out += n;
                break;
        }
    }

    return out;
}

/**
 * Encode a translated value back into `.properties` form. Only the
 * structural escapes are emitted; non-ASCII is left as UTF-8 (this tool
 * writes UTF-8 files, not legacy ISO-8859-1). Leading spaces are
 * escaped so they survive the reader's value-trimming.
 * @param s - the literal value to encode
 * @returns the escaped value
 */
function escapePropertiesValue(s: string): string {
    let out = "";
    for (const ch of s) {
        switch (ch) {
            case "\\":
                out += "\\\\";
                break;
            case "\n":
                out += "\\n";
                break;
            case "\r":
                out += "\\r";
                break;
            case "\t":
                out += "\\t";
                break;
            case "\f":
                out += "\\f";
                break;
            default:
                out += ch;
        }
    }

    // Leading whitespace is otherwise stripped by the reader.
    return out.replace(/^[ \t\f]+/, (m) =>
        [...m].map((ch) => `\\${ch === " " ? " " : ch}`).join(""),
    );
}

/**
 * Split a single physical line into its key, separator, and the index
 * where the value begins. `rawKey` includes any leading whitespace so
 * re-emitting `rawKey + separator` reproduces the original prefix; the
 * logical `key` is the unescaped, trimmed form used in the flat map.
 * @param line - the first physical line of a logical entry
 * @returns the parsed key, raw key, separator, and value start index
 */
function splitKeyValue(line: string): {
    key: string;
    rawKey: string;
    separator: string;
    valueStart: number;
} {
    let i = 0;
    while (i < line.length && /[ \t\f]/.test(line[i])) i++;
    const keyStart = i;

    let keyEnd = i;
    while (keyEnd < line.length) {
        const c = line[keyEnd];
        if (c === "\\") {
            keyEnd += 2;
            continue;
        }

        if (c === "=" || c === ":" || c === " " || c === "\t" || c === "\f") {
            break;
        }

        keyEnd++;
    }

    let j = keyEnd;
    while (j < line.length && /[ \t\f]/.test(line[j])) j++;
    if (line[j] === "=" || line[j] === ":") j++;
    while (j < line.length && /[ \t\f]/.test(line[j])) j++;

    return {
        key: unescapeProperties(line.slice(keyStart, keyEnd)),
        rawKey: line.slice(0, keyEnd),
        separator: line.slice(keyEnd, j),
        valueStart: j,
    };
}

/**
 * Join the value across continuation lines into one escaped string:
 * drop each continuation backslash, strip leading whitespace from
 * continuation lines, and shed any stray trailing `\r` (CRLF inputs).
 * @param physLines - the physical lines making up one logical entry
 * @param valueStart - index where the value begins on line one
 * @returns the still-escaped joined value
 */
function assembleValue(physLines: string[], valueStart: number): string {
    let value = "";
    for (let j = 0; j < physLines.length; j++) {
        let seg =
            j === 0
                ? physLines[0].slice(valueStart)
                : physLines[j].replace(/^[ \t\f]+/, "");

        seg = seg.replace(/\r$/, "");
        // Every line but the last carries the continuation backslash;
        // strip the single trailing one, leaving real escapes intact.
        if (j < physLines.length - 1) seg = seg.replace(/\\$/, "");
        value += seg;
    }

    return value;
}

function stripPlaceholders(text: string): {
    normalized: string;
    map: PlaceholderMap;
} {
    const tokens: string[] = [];
    const normalized = text.replace(MESSAGE_FORMAT_REGEX, (match, num) => {
        tokens[Number(num)] = match;
        return `{{arg${num}}}`;
    });

    return { map: { tokens }, normalized };
}

function restorePlaceholders(text: string, map: PlaceholderMap): string {
    if (map.tokens.length === 0) return text;
    return text.replace(/\{\{arg(\d+)\}\}/g, (_match, idx) => {
        // A model-invented arg reference with no captured token is left
        // literal rather than silently dropped — same stance as the PO
        // adapter; the verification step guards against it.
        const original = map.tokens[Number(idx)];
        return original ?? `{{arg${idx}}}`;
    });
}

const PropertiesAdapter: FormatAdapter<PropertiesSidecar> = {
    extensions: [".properties"] as const,
    name: "properties",

    read(raw: string): {
        flat: Record<string, string>;
        sidecar: PropertiesSidecar;
    } {
        const trailingNewline = raw.endsWith("\n");
        const lines = raw.split("\n");
        // A trailing newline yields a final empty element; it is encoded
        // by `trailingNewline`, not as its own blank record.
        if (trailingNewline) lines.pop();

        const flat: Record<string, string> = {};
        const records: PropertyRecord[] = [];

        let i = 0;
        while (i < lines.length) {
            const physical = lines[i];
            const head = physical.replace(/^[ \t\f]+/, "").replace(/\r$/, "");

            // Blank and comment lines pass through verbatim. Comments
            // (`#` / `!`) are never subject to line continuation.
            if (head === "" || head[0] === "#" || head[0] === "!") {
                records.push({ kind: "raw", text: physical });
                i++;
                continue;
            }

            const physLines = [physical];
            while (
                endsWithOddBackslash(physLines[physLines.length - 1]) &&
                i + 1 < lines.length
            ) {
                i++;
                physLines.push(lines[i]);
            }

            i++;

            const { key, rawKey, separator, valueStart } =
                splitKeyValue(physLines[0]);

            const rawValue = assembleValue(physLines, valueStart);
            const { normalized, map } = stripPlaceholders(
                unescapeProperties(rawValue),
            );

            flat[key] = normalized;
            records.push({
                key,
                kind: "entry",
                normalizedValue: normalized,
                placeholders: map,
                rawBlock: physLines.join("\n"),
                rawKey,
                separator,
            });
        }

        return {
            flat,
            sidecar: { kind: "properties", records, trailingNewline },
        };
    },

    write(
        translated: Record<string, string>,
        sidecar: PropertiesSidecar,
    ): string {
        const out: string[] = [];
        for (const record of sidecar.records) {
            if (record.kind === "raw") {
                out.push(record.text);
                continue;
            }

            const value = translated[record.key];
            // Unchanged (or dropped) values re-emit the original bytes,
            // preserving the source's exact escaping and continuations.
            if (value === undefined || value === record.normalizedValue) {
                out.push(record.rawBlock);
                continue;
            }

            const restored = restorePlaceholders(value, record.placeholders);
            out.push(
                record.rawKey +
                    record.separator +
                    escapePropertiesValue(restored),
            );
        }

        const body = out.join("\n");
        return sidecar.trailingNewline ? `${body}\n` : body;
    },
};

export default PropertiesAdapter;
