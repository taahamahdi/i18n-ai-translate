export default interface TranslationDiffOptions {
    apiKey: string;
    inputLanguage: string;
    inputJSONBefore: Object;
    inputJSONAfter: Object;
    toUpdateJSONs: { [languageCode: string]: Object };
    templatedStringPrefix?: string;
    templatedStringSuffix?: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
}
