import type DryRun from "./dry_run";
import type Options from "./options";

export default interface TranslateFileOptions extends Options {
    inputFilePath: string;
    outputFilePath: string;
    dryRun?: DryRun;
    forceLanguageName?: string;
    /**
     * Format adapter name (e.g. `"json"`). When unset, the adapter is
     * inferred from the input file's extension. Unknown extensions fall
     * back to the JSON adapter for backwards compatibility.
     */
    format?: string;
}
