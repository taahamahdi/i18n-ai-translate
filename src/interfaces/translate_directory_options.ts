import type Options from "./options";

export default interface TranslateDirectoryOptions extends Options {
    baseDirectory: string;
    inputLanguageCode: string;
    outputLanguageCode: string;
}
