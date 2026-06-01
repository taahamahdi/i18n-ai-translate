/**
 * A format adapter translates between the on-disk file format and the
 * pipeline's flat `Record<string, string>` contract.
 *
 * `read` returns the flat map plus an opaque, format-specific
 * `sidecar` that carries everything the pipeline doesn't need to see
 * (comments, metadata, ordering, plural counts, original placeholder
 * syntax). `write` takes the translated flat map together with the
 * `sidecar` returned by `read` to reconstruct the output file — so
 * unchanged keys round-trip byte-for-byte.
 *
 * The `TSidecar` generic lets each adapter keep a precise type
 * internally; the registry erases it at its boundary so callers can
 * hold a heterogeneous list of adapters without unsafe casts.
 */
export default interface FormatAdapter<TSidecar = unknown> {
    /** Human-readable name; matches `--format <name>` on the CLI. */
    readonly name: string;

    /** File extensions this adapter claims (leading dot, e.g. `.json`). */
    readonly extensions: readonly string[];

    read(raw: string): { flat: Record<string, string>; sidecar: TSidecar };

    write(
        translated: Record<string, string>,
        sidecar: TSidecar,
        inputLanguageCode: string,
        outputLanguageCode: string,
    ): string;
}
