import type Options from "./options";

export default interface TranslateFileDiffOptions extends Options {
    inputLanguageCode: string;
    inputBeforeFileOrPath: string;
    inputAfterFileOrPath: string;
}
