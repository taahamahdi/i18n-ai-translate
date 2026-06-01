import { DEFAULT_RULE, getPluralRule } from "./po_plural_rules";
import { po } from "gettext-parser";
import type { GetTextComment, GetTextTranslations } from "gettext-parser";
import type FormatAdapter from "./format_adapter";

/**
 * ASCII Record Separator — used to join msgctxt, msgid, and optional
 * plural-suffix segments into a single flat key. Chosen for the same
 * reason `DIRECTORY_KEY_DELIMITER` was picked elsewhere: no legal PO
 * content can contain a control character, so round-trip is unambiguous.
 */
const KEY_DELIMITER = "\x1e";

/**
 * printf-style placeholder: `%s`, `%d`, `%1$s`, `%2$.2f`, … Capture
 * groups: (1) optional `N$` positional index.
 *
 * Deliberately tolerant — the adapter's contract is "whatever we strip
 * on read, we restore on write"; we don't need to fully validate the
 * printf spec.
 */
const PRINTF_REGEX =
    /%(?:(\d+)\$)?[-+ #0]*\d*(?:\.\d+)?(?:hh|h|ll|l|j|z|t|L)?[sdifFeEgGxXoucpn%]/g;

type PlaceholderMap = {
    /** Ordered list of native tokens, one per arg slot. */
    tokens: string[];
    /** Whether the entry used positional (`%1$s`) or bare (`%s`) tokens. */
    positional: boolean;
};

type POEntryMeta = {
    msgctxt?: string;
    msgid: string;
    isPlural: boolean;
    /** Original comments; preserved on write. */
    comments?: GetTextComment;
    placeholders?: PlaceholderMap;
};

/**
 * Everything we need to reconstruct the PO file after the flat map
 * round-trips through the pipeline. The parsed table is kept so header
 * fields, ordering, obsolete entries, and unreferenced comments all
 * survive a write.
 */
type POSidecar = {
    kind: "po";
    parsed: GetTextTranslations;
    /** Keyed by the same flat key used by the pipeline. */
    metaByKey: Record<string, POEntryMeta>;
    /** Source language's plural category list, captured at read time. */
    sourceCategories: readonly string[];
};

function makeKey(
    msgctxt: string | undefined,
    msgid: string,
    suffix?: string,
): string {
    const ctx = msgctxt ?? "";
    return suffix
        ? `${ctx}${KEY_DELIMITER}${msgid}${KEY_DELIMITER}${suffix}`
        : `${ctx}${KEY_DELIMITER}${msgid}`;
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

        // Array positions are 0-based but arg indices are 1-based; keep
        // them aligned so a re-read matches on the same index.
        tokens[index - 1] = match;
        return `{{arg${index}}}`;
    });

    return { map: { positional, tokens }, normalized };
}

function restorePlaceholders(text: string, map?: PlaceholderMap): string {
    if (!map || map.tokens.length === 0) return text;
    return text.replace(/\{\{arg(\d+)\}\}/g, (_match, idx) => {
        const original = map.tokens[Number(idx) - 1];
        // If the model invented an extra arg reference, leave the
        // placeholder literal — surfacing it is better than silently
        // deleting it. The verification step already guards this.
        return original ?? `{{arg${idx}}}`;
    });
}

/**
 * Resolve the source language's plural category list from the PO
 * header. Falls back to English-style two-form if the header is
 * missing or unrecognized.
 * @param headers - the parsed PO header map
 * @returns the source language's ordered plural category list
 */
function inferSourceCategories(
    headers: Record<string, string>,
): readonly string[] {
    const lang = headers["Language"] ?? headers["language"] ?? "";
    const code = lang.toLowerCase().split(/[-_]/)[0];
    if (!code) return DEFAULT_RULE.categories;
    return getPluralRule(code).categories;
}

const POAdapter: FormatAdapter<POSidecar> = {
    extensions: [".po"] as const,
    name: "po",

    read(raw: string): { flat: Record<string, string>; sidecar: POSidecar } {
        const parsed = po.parse(raw);
        const sourceCategories = inferSourceCategories(parsed.headers);

        const flat: Record<string, string> = {};
        const metaByKey: Record<string, POEntryMeta> = {};

        for (const ctx of Object.keys(parsed.translations)) {
            const bucket = parsed.translations[ctx];
            for (const msgid of Object.keys(bucket)) {
                const entry = bucket[msgid];
                // The PO header is stored as the empty-msgid entry in
                // the empty-context bucket; skip it from the flat map.
                if (ctx === "" && msgid === "") continue;

                if (entry.msgid_plural) {
                    const msgids = [entry.msgid, entry.msgid_plural];
                    for (let i = 0; i < msgids.length; i++) {
                        // Source-language PO files typically only have
                        // msgstr[0] / msgstr[1] populated when acting
                        // as the *source*; we actually want to expose
                        // the English msgid / msgid_plural for the
                        // pipeline to translate, since msgstr is the
                        // target-language slot. For a pristine source
                        // PO (msgstr empty) this is the only sensible
                        // shape anyway.
                        const text = msgids[i];
                        const suffix = i === 0 ? "_one" : "_other";
                        const { normalized, map } = stripPlaceholders(text);
                        const key = makeKey(entry.msgctxt, entry.msgid, suffix);
                        flat[key] = normalized;
                        metaByKey[key] = {
                            comments: entry.comments,
                            isPlural: true,
                            msgctxt: entry.msgctxt,
                            msgid: entry.msgid,
                            placeholders: map,
                        };
                    }
                } else {
                    const { normalized, map } = stripPlaceholders(entry.msgid);
                    const key = makeKey(entry.msgctxt, entry.msgid);
                    flat[key] = normalized;
                    metaByKey[key] = {
                        comments: entry.comments,
                        isPlural: false,
                        msgctxt: entry.msgctxt,
                        msgid: entry.msgid,
                        placeholders: map,
                    };
                }
            }
        }

        return {
            flat,
            sidecar: {
                kind: "po",
                metaByKey,
                parsed,
                sourceCategories,
            },
        };
    },

    write(
        translated: Record<string, string>,
        sidecar: POSidecar,
        _inputLanguageCode: string,
        outputLanguageCode: string,
    ): string {
        const targetRule = getPluralRule(outputLanguageCode);

        // Deep-clone the parsed table so we don't mutate the sidecar
        // held by the caller (translateDiff may reuse it).
        const out: GetTextTranslations = {
            charset: sidecar.parsed.charset,
            headers: { ...sidecar.parsed.headers },
            obsolete: sidecar.parsed.obsolete,
            translations: {},
        };

        // Update the header to reflect the target language's plurals.
        out.headers["Plural-Forms"] = targetRule.forms;
        out.headers["Language"] = outputLanguageCode;

        for (const ctx of Object.keys(sidecar.parsed.translations)) {
            out.translations[ctx] = {};
            const bucket = sidecar.parsed.translations[ctx];
            for (const msgid of Object.keys(bucket)) {
                const original = bucket[msgid];
                if (ctx === "" && msgid === "") {
                    // Preserve the PO header entry verbatim.
                    out.translations[ctx][msgid] = {
                        ...original,
                        // gettext-parser expects msgstr to be an array.
                        msgstr: original.msgstr,
                    };
                    continue;
                }

                if (original.msgid_plural) {
                    const oneKey = makeKey(
                        original.msgctxt,
                        original.msgid,
                        "_one",
                    );

                    const otherKey = makeKey(
                        original.msgctxt,
                        original.msgid,
                        "_other",
                    );

                    const oneMeta = sidecar.metaByKey[oneKey];
                    const otherMeta = sidecar.metaByKey[otherKey];
                    const translatedOne = translated[oneKey];
                    const translatedOther = translated[otherKey];

                    // Fan-in: re-expand the two i18next plural slots
                    // (`_one` / `_other`) into the target language's
                    // full msgstr[] array. For a language with >2
                    // forms we clone the `_other` slot into every
                    // non-`one` category; it's the honest v1 behavior
                    // given i18next's own two-form plural marking.
                    // Each source slot carries its own placeholder map
                    // (the singular and plural forms can differ), so
                    // restore each pick with the matching one.
                    const msgstr: string[] = [];
                    for (let i = 0; i < targetRule.nplurals; i++) {
                        const isOne = targetRule.categories[i] === "one";
                        const pick = isOne ? translatedOne : translatedOther;
                        const map = isOne
                            ? oneMeta?.placeholders
                            : otherMeta?.placeholders;

                        msgstr.push(restorePlaceholders(pick ?? "", map));
                    }

                    out.translations[ctx][msgid] = {
                        ...original,
                        msgstr,
                    };
                } else {
                    const key = makeKey(original.msgctxt, original.msgid);
                    const meta = sidecar.metaByKey[key];
                    const translatedText = translated[key] ?? "";
                    out.translations[ctx][msgid] = {
                        ...original,
                        msgstr: [
                            restorePlaceholders(
                                translatedText,
                                meta?.placeholders,
                            ),
                        ],
                    };
                }
            }
        }

        return po.compile(out).toString("utf-8");
    },
};

export default POAdapter;
