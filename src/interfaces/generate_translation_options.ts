import type { TranslateItem } from "src/types";
import type Chats from "./chats";
import type OverridePrompt from "./override_prompt";

export default interface GenerateTranslationOptions {
    chats: Chats;
    inputLanguage: string;
    outputLanguage: string;
    translateItems: TranslateItem[];
    verboseLogging: boolean;
    ensureChangedTranslation: boolean;
    skipTranslationVerification: boolean;
    skipStylingVerification: boolean;
    overridePrompt?: OverridePrompt;
}
