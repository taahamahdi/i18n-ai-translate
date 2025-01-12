import type Options from "./options";

export default interface TranslateDirectoryDiffOptions extends Options {
    baseDirectory: string;
    inputLanguageCode: string;
    inputFolderNameBefore: string;
    inputFolderNameAfter: string;
}
