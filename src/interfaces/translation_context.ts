import type { TranslationStats } from "../types";
import type ChatPool from "../chat_pool";
import type TranslateOptions from "./translate_options";

/**
 * Everything a pipeline needs to run one translation.
 *
 * Pipelines used to receive (flatInput, options, pool, stats, groups) as
 * five positional args. Collapsing them into one context means a new
 * piece of run-state doesn't cascade a signature change through every
 * layer of the call graph.
 */
export default interface TranslationContext {
    flatInput: { [key: string]: string };
    options: TranslateOptions;
    pool: ChatPool;
    stats: TranslationStats;
    groups: Array<{ [key: string]: string }>;
}
