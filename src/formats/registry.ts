import JSONAdapter from "./json_adapter";
import POAdapter from "./po_adapter";
import path from "path";
import type FormatAdapter from "./format_adapter";

// Sidecar types are adapter-private; the registry holds adapters with
// the sidecar type erased so we can dispatch on extension or name
// without leaking each format's internal shape.
const ADAPTERS: readonly FormatAdapter<unknown>[] = [JSONAdapter, POAdapter];

/**
 * Look up an adapter by its `--format <name>` identifier.
 * @param name - adapter name (e.g. `"json"`)
 * @returns the matching adapter, or undefined
 */
export function getAdapterByName(
    name: string,
): FormatAdapter<unknown> | undefined {
    return ADAPTERS.find((a) => a.name === name);
}

/**
 * Look up an adapter by file extension (leading dot included or not).
 * @param ext - the file extension, case-insensitive
 * @returns the matching adapter, or undefined
 */
export function getAdapterByExtension(
    ext: string,
): FormatAdapter<unknown> | undefined {
    const normalized = ext.startsWith(".")
        ? ext.toLowerCase()
        : `.${ext.toLowerCase()}`;

    return ADAPTERS.find((a) => a.extensions.includes(normalized));
}

/**
 * Resolve an adapter from a filename, or fall back to the default
 * JSON adapter. Used by the file wrappers when the caller hasn't
 * passed `--format` explicitly.
 * @param filename - the filename to inspect
 * @returns the matching adapter, or the JSON default
 */
export function getAdapterForFile(filename: string): FormatAdapter<unknown> {
    const ext = path.extname(filename);
    return getAdapterByExtension(ext) ?? JSONAdapter;
}

/**
 * @returns the names of every registered adapter
 */
export function listFormatNames(): string[] {
    return ADAPTERS.map((a) => a.name);
}
