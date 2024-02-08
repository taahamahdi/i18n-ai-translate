export default interface TranslationOptions {
    apiKey: string;
    inputJSON: any;
    inputLanguage: string;
    outputLanguage: string;
    templatedStringPrefix?: string;
    templatedStringSuffix?: string;
}
