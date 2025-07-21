import type Options from "./options";

export default interface TranslateOptions extends Options {
    inputJSON: Object;
    inputLanguageCode: string;
    outputLanguageCode: string;
    forceLanguageName?: string;
}
