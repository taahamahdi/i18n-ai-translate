import type Options from "./options";

export default interface TranslateDiffOptions extends Options {
    inputLanguageCode: string;
    inputJSONBefore: Object;
    inputJSONAfter: Object;
    toUpdateJSONs: { [languageCode: string]: Object };
}
