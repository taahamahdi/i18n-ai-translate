import type Options from "./options";

export default interface TranslateFileDiffOptions extends Options {
    inputLanguage: string;
    inputBeforeFileOrPath: string;
    inputAfterFileOrPath: string;
    outputFilesOrPaths: Array<string>;
}
