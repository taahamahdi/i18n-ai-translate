export default interface TranslateFileDiffOptions {
    apiKey: string;
    inputLanguage: string;
    inputBeforeFileOrPath: string;
    inputAfterFileOrPath: string;
    outputFilesOrPaths: Array<string>;
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
}
