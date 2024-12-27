import type Options from "./options";

export default interface TranslateFileOptions extends Options {
    inputFileOrPath: string;
    outputFileOrPath: string;
}
