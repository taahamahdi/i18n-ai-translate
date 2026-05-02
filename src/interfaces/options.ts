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
    templatedStringPrefix?: string;
    templatedStringSuffix?: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
    batchMaxTokens?: number;
    skipTranslationVerification?: boolean;
    skipStylingVerification?: boolean;
    overridePrompt?: OverridePrompt;
    promptMode: PromptMode;
    continueOnError?: boolean;
    concurrency?: number;
    /**
     * Optional product/domain context injected into prompts — e.g.
     * "a music trivia game for Discord" or "a B2B invoicing SaaS".
     * Helps the model pick domain-specific terminology and tone.
     */
    context?: string;
    /**
     * Language codes (or filenames) to skip when translating or
     * running diff. Useful when certain locales are maintained
     * manually and shouldn't be machine-translated over.
     */
    excludeLanguages?: string[];
    /**
     * Cap on tokens-per-minute across all concurrent workers. When
     * set, RateLimiter holds each call until both the RPM slot and
     * the TPM budget are available. 0 / undefined disables the check.
     */
    tokensPerMinute?: number;
}
