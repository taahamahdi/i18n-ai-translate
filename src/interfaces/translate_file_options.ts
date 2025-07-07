import type DryRun from "./dry_run";
import type Options from "./options";

export default interface TranslateFileOptions extends Options {
    inputFilePath: string;
    outputFilePath: string;
    dryRun?: DryRun;
    forceLanguageName?: string;
}
