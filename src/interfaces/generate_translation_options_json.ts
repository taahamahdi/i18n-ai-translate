import type { TranslateItem } from "src/generate_json/types_json";
import type Chats from "./chats";
import type OverridePrompt from "./override_prompt";

export default interface GenerateTranslationOptionsJson {
    chats: Chats;
    inputLanguage: string;
    outputLanguage: string;
    translateItems: TranslateItem[];
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verboseLogging: boolean;
    ensureChangedTranslation: boolean;
    skipTranslationVerification: boolean;
    skipStylingVerification: boolean;
    overridePrompt?: OverridePrompt;
}
