import type { ChatParams, Model } from "../types";
import type Engine from "../enums/engine";

export default interface TranslationDiffOptions {
    engine: Engine;
    model: Model;
    chatParams: ChatParams;
    rateLimitMs: number;
    apiKey: string;
    inputLanguage: string;
    inputJSONBefore: Object;
    inputJSONAfter: Object;
    toUpdateJSONs: { [languageCode: string]: Object };
    templatedStringPrefix?: string;
    templatedStringSuffix?: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
}
