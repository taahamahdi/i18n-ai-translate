export default interface TranslateFileOptions {
    apiKey: string;
    inputFileOrPath: string;
    outputFileOrPath: string;
    forceLanguageName?: string;
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
}
