import type { ChatParams, Model } from "../types";
import type Engine from "../enums/engine";

export default interface TranslationOptions {
    engine: Engine;
    model: Model;
    chatParams: ChatParams;
    rateLimitMs: number;
    apiKey: string;
    inputJSON: Object;
    inputLanguage: string;
    outputLanguage: string;
    templatedStringPrefix?: string;
    templatedStringSuffix?: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
}
