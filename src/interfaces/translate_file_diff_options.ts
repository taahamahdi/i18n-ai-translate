import type DryRun from "./dry_run";
import type Options from "./options";

export default interface TranslateFileDiffOptions extends Options {
    inputLanguageCode: string;
    inputBeforeFileOrPath: string;
    inputAfterFileOrPath: string;
    dryRun?: DryRun;
    /** Format adapter name; inferred from extension when unset. */
    format?: string;
}
