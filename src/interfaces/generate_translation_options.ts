import type Chats from "./chats";

export default interface GenerateTranslationOptions {
    chats: Chats;
    inputLanguage: string;
    outputLanguage: string;
    input: string;
    keys: Array<string>;
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verboseLogging: boolean;
    ensureChangedTranslation: boolean;
    skipTranslationVerification: boolean;
    skipStylingVerification: boolean;
}
