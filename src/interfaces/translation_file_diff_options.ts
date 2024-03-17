import type { ChatParams, Model } from "../types";
import type Engine from "../enums/engine";

export default interface TranslateFileDiffOptions {
    engine: Engine;
    model: Model;
    chatParams: ChatParams;
    rateLimitMs: number;
    apiKey: string;
    inputLanguage: string;
    inputBeforeFileOrPath: string;
    inputAfterFileOrPath: string;
    outputFilesOrPaths: Array<string>;
    templatedStringPrefix: string;
    templatedStringSuffix: string;
    verbose?: boolean;
    ensureChangedTranslation?: boolean;
    batchSize?: number;
}
