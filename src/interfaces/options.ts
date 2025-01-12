import type { ChatParams, Model } from "../types";
import type Engine from "../enums/engine";

export default interface Options {
    engine: Engine;
    model: Model;
    chatParams: ChatParams;
    rateLimitMs: number;
    apiKey: string;
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
}
