import type Options from "./options";

export default interface TranslateDirectoryDiffOptions extends Options {
    pathBefore: string;
    pathAfter: string;
    outputPath: string;
}
