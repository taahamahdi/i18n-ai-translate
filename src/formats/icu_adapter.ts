import { FLATTEN_DELIMITER } from "../constants";
import { type Select, type Token, parse } from "@messageformat/parser";
import { flatten, unflatten } from "flat";
import { getPluralRule } from "./po_plural_rules";
import type FormatAdapter from "./format_adapter";

/**
 * Placeholder standing in for ICU's octothorpe (`#`, the formatted
 * plural number). Wrapped in the pipeline's `{{…}}` convention so the
 * prompts' existing "never translate a placeholder" rule covers it.
 */
const POUND_PLACEHOLDER = "{{#}}";

/** Suffix marking an expanded `select` branch in a flat key. */
const SELECT_SUFFIX = "_select_";

/**
 * Original ICU source for each argument, keyed by the placeholder that
 * replaced it. Rebuilding a currency skeleton from its parsed parts is
 * easy to get subtly wrong, so the exact source text is recorded
 * instead and substituted back verbatim.
 */
type ArgSources = Record<string, string>;

type ICUEntry =
    | { kind: "plain"; key: string; argSources: ArgSources; original: string }
    | {
          kind: "control";
          key: string;
          /** `plural`, `selectordinal`, or `select`. */
          type: Select["type"];
          arg: string;
          offset: number | undefined;
          /** Case keys in source order, e.g. `["one", "other"]`. */
          categories: string[];
          argSources: ArgSources;
          /** What `read` produced per suffix, to detect "nothing changed". */
          rendered: Record<string, string>;
          original: string;
      }
    /** Non-string JSON values, and messages too complex to split safely. */
    | { kind: "passthrough"; key: string; value: unknown };

type ICUSidecar = {
    kind: "icu";
    entries: ICUEntry[];
};

const CONTROL_TYPES = new Set(["plural", "selectordinal", "select"]);

function isControl(token: Token): token is Select {
    return CONTROL_TYPES.has(token.type);
}

/**
 * True when any token below this one is a plural/select. Nesting needs a
 * combinatorial expansion, so v1 passes those messages through rather
 * than risk mangling them.
 * @param tokens - tokens to scan
 * @returns whether a nested control exists
 */
function hasNestedControl(tokens: Token[]): boolean {
    return tokens.some(isControl);
}

/**
 * Reconstruct a function argument's ICU source, e.g.
 * `{amount, number, ::currency/USD}`. Returns undefined when the style
 * contains anything but literal text, which the caller treats as a
 * reason to pass the whole message through untouched.
 * @param token - the function-argument token
 * @returns the ICU source, or undefined
 */
function functionSource(
    token: Token & { type: "function" },
): string | undefined {
    if (!token.param || token.param.length === 0) {
        return `{${token.arg}, ${token.key}}`;
    }

    let param = "";
    for (const part of token.param) {
        if (part.type !== "content") return undefined;
        param += part.value;
    }

    return `{${token.arg}, ${token.key},${param}}`;
}

/**
 * Render tokens into the flat string the pipeline translates.
 *
 * Arguments become `{{name}}` so existing placeholder protection
 * applies. Rich-text tags arrive as literal content and stay inline,
 * which keeps the sentence readable and is what models handle best.
 * @param tokens - tokens to render
 * @param argSources - accumulator mapping placeholder to ICU source
 * @returns the translatable string, or undefined if unrenderable
 */
function render(tokens: Token[], argSources: ArgSources): string | undefined {
    let out = "";
    for (const token of tokens) {
        switch (token.type) {
            case "content":
                out += token.value;
                break;
            case "octothorpe":
                out += POUND_PLACEHOLDER;
                break;
            case "argument":
                argSources[`{{${token.arg}}}`] = `{${token.arg}}`;
                out += `{{${token.arg}}}`;
                break;
            case "function": {
                const source = functionSource(token);
                if (source === undefined) return undefined;
                argSources[`{{${token.arg}}}`] = source;
                out += `{{${token.arg}}}`;
                break;
            }

            default:
                // A control token: callers expand these before rendering.
                return undefined;
        }
    }

    return out;
}

/**
 * Invert `render`: turn a translated string back into ICU source.
 * @param text - the translated string
 * @param argSources - placeholder to ICU source
 * @returns ICU message source
 */
function restore(text: string, argSources: ArgSources): string {
    let out = text;
    for (const [placeholder, source] of Object.entries(argSources)) {
        out = out.split(placeholder).join(source);
    }

    out = out.split(POUND_PLACEHOLDER).join("#");
    // A placeholder the model invented has no recorded source; emit a
    // bare ICU argument so the message still parses.
    return out.replace(/\{\{([^{}]+)\}\}/g, "{$1}");
}

/**
 * Guard against writing a catalogue that throws in the user's app: only
 * return the rebuilt message if it actually parses.
 * @param body - candidate ICU source
 * @returns the source if valid, else undefined
 */
function validated(body: string): string | undefined {
    try {
        parse(body);
        return body;
    } catch {
        return undefined;
    }
}

/**
 * Exact matches are language-independent and always kept.
 * @param key - a plural case key
 * @returns whether the key is an exact match rather than a category
 */
function isExactCase(key: string): boolean {
    return key.startsWith("=");
}

const ICUAdapter: FormatAdapter<ICUSidecar> = {
    // Registered by name only: `.json` stays with the i18next adapter so
    // existing users are unaffected. ICU is opt-in via --file-format icu.
    extensions: [] as const,
    name: "icu",

    read(raw: string): { flat: Record<string, string>; sidecar: ICUSidecar } {
        const parsed = JSON.parse(raw);
        const flatSource = flatten(parsed, {
            delimiter: FLATTEN_DELIMITER,
        }) as Record<string, unknown>;

        const flat: Record<string, string> = {};
        const entries: ICUEntry[] = [];

        for (const [key, value] of Object.entries(flatSource)) {
            if (typeof value !== "string") {
                entries.push({ key, kind: "passthrough", value });
                continue;
            }

            let tokens: Token[];
            try {
                tokens = parse(value);
            } catch {
                // Not valid ICU. Treat it as plain text so one odd string
                // can't fail the whole run.
                entries.push({
                    argSources: {},
                    key,
                    kind: "plain",
                    original: value,
                });
                flat[key] = value;
                continue;
            }

            const controls = tokens.filter(isControl);

            if (controls.length === 0) {
                const argSources: ArgSources = {};
                const rendered = render(tokens, argSources);
                if (rendered === undefined) {
                    entries.push({ key, kind: "passthrough", value });
                    continue;
                }

                entries.push({
                    argSources,
                    key,
                    kind: "plain",
                    original: value,
                });
                flat[key] = rendered;
                continue;
            }

            const control = controls[0];
            const nested = control.cases.some((c) =>
                hasNestedControl(c.tokens),
            );

            if (controls.length > 1 || nested) {
                entries.push({ key, kind: "passthrough", value });
                continue;
            }

            // Each branch is rendered as the *whole* sentence with that
            // branch selected, so the model sees complete text rather
            // than fragments — and target languages can order words
            // differently per plural form.
            const argSources: ArgSources = {};
            const rendered: Record<string, string> = {};
            const categories: string[] = [];
            let renderable = true;

            for (const branch of control.cases) {
                const expanded = tokens.flatMap((token) =>
                    token === control ? branch.tokens : [token],
                );

                const text = render(expanded, argSources);
                if (text === undefined) {
                    renderable = false;
                    break;
                }

                const suffix =
                    control.type === "select"
                        ? `${SELECT_SUFFIX}${branch.key}`
                        : `_${branch.key}`;

                categories.push(branch.key);
                rendered[suffix] = text;
            }

            if (!renderable) {
                entries.push({ key, kind: "passthrough", value });
                continue;
            }

            for (const [suffix, text] of Object.entries(rendered)) {
                flat[`${key}${suffix}`] = text;
            }

            entries.push({
                arg: control.arg,
                argSources,
                categories,
                key,
                kind: "control",
                offset: control.pluralOffset,
                original: value,
                rendered,
                type: control.type,
            });
        }

        return { flat, sidecar: { entries, kind: "icu" } };
    },

    write(
        translated: Record<string, string>,
        sidecar: ICUSidecar,
        _inputLanguageCode: string,
        outputLanguageCode: string,
    ): string {
        const out: Record<string, unknown> = {};

        for (const entry of sidecar.entries) {
            if (entry.kind === "passthrough") {
                out[entry.key] = entry.value;
                continue;
            }

            if (entry.kind === "plain") {
                const value = translated[entry.key];
                out[entry.key] =
                    value === undefined
                        ? entry.original
                        : (validated(restore(value, entry.argSources)) ??
                          entry.original);
                continue;
            }

            // Untouched: hand back the exact source so a partially
            // translated catalogue keeps unchanged entries byte-for-byte.
            const untouched = Object.entries(entry.rendered).every(
                ([suffix, text]) => {
                    const value = translated[`${entry.key}${suffix}`];
                    return value === undefined || value === text;
                },
            );

            if (untouched) {
                out[entry.key] = entry.original;
                continue;
            }

            const branches: string[] = [];

            if (entry.type === "select") {
                for (const category of entry.categories) {
                    const value =
                        translated[`${entry.key}${SELECT_SUFFIX}${category}`];

                    if (value === undefined) break;
                    branches.push(
                        `${category} {${restore(value, entry.argSources)}}`,
                    );
                }

                out[entry.key] =
                    branches.length === entry.categories.length
                        ? (validated(
                              `{${entry.arg}, select, ${branches.join(" ")}}`,
                          ) ?? entry.original)
                        : entry.original;
                continue;
            }

            // Exact matches (`=0`) are language-independent, so they are
            // carried across verbatim rather than mapped onto categories.
            for (const category of entry.categories.filter(isExactCase)) {
                const value = translated[`${entry.key}_${category}`];
                if (value === undefined) continue;
                branches.push(
                    `${category} {${restore(value, entry.argSources)}}`,
                );
            }

            // ICU *requires* an `other` branch, while the Gettext table is
            // index-based and omits it for languages like Russian
            // (one/few/many). Without this union the message is invalid
            // and would be rejected, silently leaving it untranslated.
            const targetCategories = [
                ...new Set([
                    ...getPluralRule(outputLanguageCode).categories,
                    "other",
                ]),
            ];

            // The source rarely has every category the target needs, so
            // missing ones reuse `other`: structurally valid, but not
            // correctly inflected. See the guide's note.
            const fallback = translated[`${entry.key}_other`];
            let complete = true;

            for (const category of targetCategories) {
                const value =
                    translated[`${entry.key}_${category}`] ?? fallback;

                if (value === undefined) {
                    complete = false;
                    break;
                }

                branches.push(
                    `${category} {${restore(value, entry.argSources)}}`,
                );
            }

            if (!complete) {
                out[entry.key] = entry.original;
                continue;
            }

            const offset = entry.offset ? `offset:${entry.offset} ` : "";
            out[entry.key] =
                validated(
                    `{${entry.arg}, ${entry.type}, ${offset}${branches.join(" ")}}`,
                ) ?? entry.original;
        }

        const unflattened = unflatten(out, { delimiter: FLATTEN_DELIMITER });
        return `${JSON.stringify(unflattened, null, 4)}\n`;
    },
};

export default ICUAdapter;
