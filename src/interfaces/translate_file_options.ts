import type Options from "./options";

export default interface TranslateFileOptions extends Options {
    inputFilePath: string;
    outputFilePath: string;
    forceLanguageName?: string;
}
