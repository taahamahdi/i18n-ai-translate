import type Chats from "./chats";
import type OverridePrompt from "./override_prompt";
import type RateLimiter from "../rate_limiter";

export default interface GenerateTranslationOptionsCSV {
    chats: Chats;
    inputLanguageCode: string;
    outputLanguageCode: string;
    input: string;
    keys: Array<string>;
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verboseLogging: boolean;
    ensureChangedTranslation: boolean;
    skipTranslationVerification: boolean;
    skipStylingVerification: boolean;
    overridePrompt?: OverridePrompt;
    rateLimiter?: RateLimiter;
}
