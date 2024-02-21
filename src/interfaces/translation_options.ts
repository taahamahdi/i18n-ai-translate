export default interface TranslationOptions {
    apiKey: string;
    inputJSON: Object;
    inputLanguage: string;
    outputLanguage: string;
    templatedStringPrefix?: string;
    templatedStringSuffix?: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
}
