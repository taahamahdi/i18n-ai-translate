import { FLATTEN_DELIMITER } from "../constants";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { isValidLanguageCode } from "../utils";
import type { Node, Scalar } from "yaml";
import type FormatAdapter from "./format_adapter";

/**
 * Rails I18n interpolation: `%{count}`, and the sprintf-style
 * `%<count>d` / `%<price>.2f` variant. Capture groups: (1) the name in
 * `%{name}` form, (2) the name in `%<name>` form.
 *
 * Deliberately tolerant — the adapter's contract is "whatever we strip
 * on read, we restore on write", so an unrecognised token is simply
 * left alone in both directions.
 */
const RAILS_INTERPOLATION_REGEX =
    /%\{([^}]+)\}|%<([^>]+)>[-+ #0]*\d*(?:\.\d+)?[sdifFeEgGxXoub]/g;

/** Native interpolation tokens, keyed by the variable name they carry. */
type PlaceholderMap = Record<string, string>;

type YAMLEntry = {
    /** Path to the scalar *within the catalogue*, i.e. below the locale root. */
    path: (string | number)[];
    /** Placeholder-stripped original value; "unchanged" sentinel on write. */
    original: string;
    placeholders: PlaceholderMap;
};

/**
 * The original source text plus the map from flat key back to its
 * position in the document.
 *
 * Unlike the other adapters we keep the raw text rather than the parsed
 * tree: `write` re-parses it every call so comments, anchors, quoting
 * styles, and key order survive, and so that one sidecar can be written
 * out once per target language without earlier languages leaking into
 * later ones (`translateDiff` reuses a single source sidecar).
 */
type YAMLSidecar = {
    kind: "yaml";
    raw: string;
    /**
     * The single top-level locale key (`en:`) when the file is a Rails-style
     * locale-rooted catalogue, or null for a plain unrooted mapping. Held
     * out of the flat keys so a source `en:` and a target `fr:` produce
     * identical keys and diff mode can line them up.
     */
    localeRoot: string | null;
    entries: Record<string, YAMLEntry>;
};

/**
 * Whether a top-level key looks like the locale wrapper Rails uses.
 * Accepts BCP-47 forms (`pt-BR`) by checking the subtag prefix, mirroring
 * `getLanguageCodeFromFilename`.
 * @param key - the candidate top-level key
 * @returns whether it should be treated as the locale root
 */
function looksLikeLocaleRoot(key: string): boolean {
    if (isValidLanguageCode(key)) return true;
    const [prefix] = key.split("-");
    return isValidLanguageCode(prefix);
}

function stripPlaceholders(text: string): {
    normalized: string;
    map: PlaceholderMap;
} {
    const map: PlaceholderMap = {};
    const normalized = text.replace(
        RAILS_INTERPOLATION_REGEX,
        (match, braceName, angleName) => {
            const name = braceName ?? angleName;
            map[name] = match;
            return `{{${name}}}`;
        },
    );

    return { map, normalized };
}

function restorePlaceholders(text: string, map: PlaceholderMap): string {
    if (Object.keys(map).length === 0) return text;
    return text.replace(/\{\{([^{}]+)\}\}/g, (match, name) => {
        // A `{{var}}` the source didn't have (already-`{{}}` content, or a
        // model invention) is left literal rather than silently dropped —
        // same stance as the PO and .properties adapters.
        const original = map[name];
        return original ?? match;
    });
}

/**
 * Rebuild a document path from a flat key for entries the source
 * catalogue didn't contain. All-digit segments become array indices,
 * matching how `collect` records sequence positions.
 * @param flatKey - the pipeline's flat key
 * @returns the path segments
 */
function splitFlatKey(flatKey: string): (string | number)[] {
    return flatKey
        .split(FLATTEN_DELIMITER)
        .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

/**
 * Recursively collect every string scalar under `node`, recording its
 * flat key and its path within the catalogue. Non-string scalars
 * (numbers, booleans, dates, null) are not translatable and are left
 * untouched in the document.
 * @param node - the current node
 * @param currentPath - path accumulated so far
 * @param flat - flat map being built
 * @param entries - sidecar entries being built
 */
function collect(
    node: unknown,
    currentPath: (string | number)[],
    flat: Record<string, string>,
    entries: Record<string, YAMLEntry>,
): void {
    if (isMap(node)) {
        for (const item of node.items) {
            const key = isScalar(item.key) ? item.key.value : item.key;
            if (typeof key !== "string" && typeof key !== "number") continue;
            collect(item.value, [...currentPath, key], flat, entries);
        }

        return;
    }

    if (isSeq(node)) {
        for (let i = 0; i < node.items.length; i++) {
            collect(node.items[i], [...currentPath, i], flat, entries);
        }

        return;
    }

    if (!isScalar(node) || typeof node.value !== "string") return;

    const flatKey = currentPath.join(FLATTEN_DELIMITER);
    const { normalized, map } = stripPlaceholders(node.value);
    flat[flatKey] = normalized;
    entries[flatKey] = {
        original: normalized,
        path: currentPath,
        placeholders: map,
    };
}

const YAMLAdapter: FormatAdapter<YAMLSidecar> = {
    extensions: [".yml", ".yaml"] as const,
    name: "yaml",

    read(raw: string): { flat: Record<string, string>; sidecar: YAMLSidecar } {
        const doc = parseDocument(raw);
        if (doc.errors.length > 0) {
            throw new Error(doc.errors[0].message);
        }

        const contents = doc.contents as Node | null;

        // A Rails locale file wraps everything in a single top-level
        // language key. Strip it so the flat keys are language-neutral.
        let localeRoot: string | null = null;
        let catalogue: unknown = contents;
        if (isMap(contents) && contents.items.length === 1) {
            const only = contents.items[0];
            const key = isScalar(only.key) ? only.key.value : undefined;
            if (typeof key === "string" && looksLikeLocaleRoot(key)) {
                localeRoot = key;
                catalogue = only.value;
            }
        }

        const flat: Record<string, string> = {};
        const entries: Record<string, YAMLEntry> = {};
        collect(catalogue, [], flat, entries);

        return { flat, sidecar: { entries, kind: "yaml", localeRoot, raw } };
    },

    write(
        translated: Record<string, string>,
        sidecar: YAMLSidecar,
        _inputLanguageCode: string,
        outputLanguageCode: string,
    ): string {
        // Re-parse rather than mutate: the caller may hand the same
        // sidecar to `write` once per target language.
        const doc = parseDocument(sidecar.raw);

        // Retarget the locale wrapper — a `fr.yml` whose root key is
        // still `en:` is silently ignored by Rails I18n.
        const contents = doc.contents as Node | null;
        if (sidecar.localeRoot !== null && isMap(contents)) {
            const rootKey = contents.items[0].key;
            if (isScalar(rootKey)) {
                (rootKey as Scalar).value = outputLanguageCode;
            }
        }

        const prefix: (string | number)[] =
            sidecar.localeRoot !== null ? [outputLanguageCode] : [];

        for (const [flatKey, value] of Object.entries(translated)) {
            const entry = sidecar.entries[flatKey];
            // Unchanged (or skipped) values keep the source node exactly
            // as written, preserving its quoting and any block style.
            if (entry && value === entry.original) continue;

            // A key the source catalogue never had comes from the existing
            // target file (diff mode), so we have no captured token map for
            // it. `%{name}` is the canonical Rails form, so that is the
            // inverse we assume — versus a known entry, where an
            // unrecognised `{{var}}` is left literal because we know it
            // wasn't in the source.
            const restored = entry
                ? restorePlaceholders(value, entry.placeholders)
                : value.replace(/\{\{([^{}]+)\}\}/g, "%{$1}");

            const fullPath = [
                ...prefix,
                ...(entry ? entry.path : splitFlatKey(flatKey)),
            ];

            const existing = doc.getIn(fullPath, true);
            if (isScalar(existing)) {
                // Assigning through the existing node keeps its quoting
                // style; the stringifier upgrades the style by itself if
                // the new text can no longer be represented that way.
                existing.value = restored;
            } else {
                doc.setIn(fullPath, restored);
            }
        }

        return doc.toString();
    },
};

export default YAMLAdapter;
