import type Options from "./options";

export default interface TranslateDirectoryDiffOptions extends Options {
    baseDirectory: string;
    inputPathBefore: string;
    inputPathAfter: string;
}
