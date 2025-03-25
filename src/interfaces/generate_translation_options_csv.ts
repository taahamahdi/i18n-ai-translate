import type Chats from "./chats";
import type OverridePrompt from "./override_prompt";

export default interface GenerateTranslationOptionsCsv {
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
    overridePrompt?: OverridePrompt;
}
