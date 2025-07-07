import type DryRun from "./dry_run";
import type Options from "./options";

export default interface TranslateDirectoryOptions extends Options {
    baseDirectory: string;
    inputLanguage: string;
    outputLanguage: string;
    dryRun?: DryRun;
    forceLanguageName?: string;
}
