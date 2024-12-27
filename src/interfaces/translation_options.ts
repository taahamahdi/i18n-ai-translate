import type Options from "./options";

export default interface TranslationOptions extends Options {
    inputJSON: Object;
    inputLanguage: string;
    outputLanguage: string;
}
