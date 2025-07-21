import type { TranslateItem } from "../generate_json/types";
import type Chats from "./chats";
import type OverridePrompt from "./override_prompt";

export default interface GenerateTranslationOptionsJSON {
    chats: Chats;
    inputLanguageCode: string;
    outputLanguageCode: string;
    translateItems: TranslateItem[];
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verboseLogging: boolean;
    ensureChangedTranslation: boolean;
    skipTranslationVerification: boolean;
    skipStylingVerification: boolean;
    overridePrompt?: OverridePrompt;
}
