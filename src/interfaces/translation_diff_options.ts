export default interface TranslationDiffOptions {
    apiKey: string;
    inputLanguage: string;
    inputJSONBefore: Object;
    inputJSONAfter: Object;
    toUpdateJSONs: { [language: string]: Object };
    templatedStringPrefix?: string;
    templatedStringSuffix?: string;
    verbose?: boolean;
}
