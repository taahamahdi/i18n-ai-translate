import type Options from "./options";

export default interface TranslateOptions extends Options {
    inputJSON: Object;
    inputLanguage: string;
    outputLanguage: string;
}
