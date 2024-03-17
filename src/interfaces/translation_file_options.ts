import type { ChatParams, Model } from "../types";
import type Engine from "../enums/engine";

export default interface TranslateFileOptions {
    engine: Engine;
    model: Model;
    chatParams: ChatParams;
    rateLimitMs: number;
    apiKey: string;
    inputFileOrPath: string;
    outputFileOrPath: string;
    forceLanguageName?: string;
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
}
