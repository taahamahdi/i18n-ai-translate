import type Options from "./options";

export default interface TranslationDiffOptions extends Options {
    inputLanguage: string;
    inputJSONBefore: Object;
    inputJSONAfter: Object;
    toUpdateJSONs: { [languageCode: string]: Object };
}
