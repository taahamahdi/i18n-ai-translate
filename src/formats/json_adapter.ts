import { FLATTEN_DELIMITER } from "../constants";
import { flatten, unflatten } from "flat";
import type FormatAdapter from "./format_adapter";

/**
 * Sidecar kept around purely so the original nested shape can be
 * rebuilt byte-identically on write even if the translation pipeline
 * adds, drops, or renames leaves. For today's i18next flow we only
 * need a marker that the file was JSON; kept as an object so future
 * additions (e.g. preserved ordering, indent width) don't widen the
 * public adapter interface.
 */
type JSONSidecar = {
    kind: "json";
};

const JSONAdapter: FormatAdapter<JSONSidecar> = {
    extensions: [".json"] as const,
    name: "json",

    read(raw: string): { flat: Record<string, string>; sidecar: JSONSidecar } {
        const parsed = JSON.parse(raw);
        const flat = flatten(parsed, {
            delimiter: FLATTEN_DELIMITER,
        }) as Record<string, string>;

        return { flat, sidecar: { kind: "json" } };
    },

    write(translated: Record<string, string>): string {
        const unflattened = unflatten(translated, {
            delimiter: FLATTEN_DELIMITER,
        });

        // Matches the historical `JSON.stringify(..., null, 4) + "\n"`
        // shape from translate_file.ts — any change here becomes a
        // diff in every user's output.
        return `${JSON.stringify(unflattened, null, 4)}\n`;
    },
};

export default JSONAdapter;
