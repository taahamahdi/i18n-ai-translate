import type { ChatParams, Model } from "../types";
import type Engine from "../enums/engine";
import type OverridePrompt from "./override_prompt";
import type PromptMode from "../enums/prompt_mode";

export default interface Options {
    engine: Engine;
    model: Model;
    chatParams: ChatParams;
    rateLimitMs: number;
    apiKey?: string;
    host?: string;
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
    skipTranslationVerification?: boolean;
    skipStylingVerification?: boolean;
    overridePrompt?: OverridePrompt;
    promptMode: PromptMode;
}
