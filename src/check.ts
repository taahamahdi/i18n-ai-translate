import {
    DEFAULT_BATCH_SIZE,
    DEFAULT_REQUEST_TOKENS,
    DEFAULT_TEMPLATED_STRING_PREFIX,
    DEFAULT_TEMPLATED_STRING_SUFFIX,
    FLATTEN_DELIMITER,
} from "./constants";
import { flatten } from "flat";
import { isValidLanguageCode, printInfo } from "./utils";
import ChatPool from "./chat_pool";
import GenerateTranslationJSON from "./generate_json/generate";
import RateLimiter from "./rate_limiter";
import type CheckOptions from "./interfaces/check_options";
import type { CheckReport } from "./interfaces/check_options";

function setDefaults(options: CheckOptions): void {
    if (!options.templatedStringPrefix)
        options.templatedStringPrefix = DEFAULT_TEMPLATED_STRING_PREFIX;
    if (!options.templatedStringSuffix)
        options.templatedStringSuffix = DEFAULT_TEMPLATED_STRING_SUFFIX;
    if (!options.batchMaxTokens)
        options.batchMaxTokens = DEFAULT_REQUEST_TOKENS;
    if (!options.batchSize) options.batchSize = DEFAULT_BATCH_SIZE;
    if (!options.verbose) options.verbose = false;
    if (options.continueOnError === undefined) options.continueOnError = true;
}

/**
 * Validate an already-translated target file against its source by
 * running the verification pipeline without the preceding translation
 * step. Returns a report listing every key the model flagged as
 * incorrect, along with a suggested correction where available.
 *
 * No files are written.
 */
export async function check(options: CheckOptions): Promise<CheckReport> {
    setDefaults(options);

    if (!isValidLanguageCode(options.inputLanguageCode)) {
        throw new Error(
            `Invalid input language code: ${options.inputLanguageCode}`,
        );
    }

    if (!isValidLanguageCode(options.outputLanguageCode)) {
        throw new Error(
            `Invalid output language code: ${options.outputLanguageCode}`,
        );
    }

    const rateLimiter = new RateLimiter(
        options.rateLimitMs,
        options.verbose as boolean,
    );

    const pool = ChatPool.create({
        apiKey: options.apiKey,
        chatParams: options.chatParams,
        concurrency: Math.max(1, options.concurrency ?? 1),
        engine: options.engine,
        host: options.host,
        model: options.model,
        rateLimiter,
    });

    const flatSource = flatten(options.inputJSON, {
        delimiter: FLATTEN_DELIMITER,
    }) as { [key: string]: string };

    const flatTarget = flatten(options.targetJSON, {
        delimiter: FLATTEN_DELIMITER,
    }) as { [key: string]: string };

    if (options.verbose) {
        printInfo(
            `Checking ${Object.keys(flatTarget).length} target keys against source...\n`,
        );
    }

    const generator = new GenerateTranslationJSON(options);
    const rawIssues = await generator.checkJSON({
        flatSource,
        flatTarget,
        options,
        pool,
    });

    return {
        issues: rawIssues.map((i) => ({
            issue: i.issue,
            key: i.key,
            original: i.original,
            suggestion: i.suggestion,
            translated: i.translated,
        })),
        languageCode: options.outputLanguageCode,
        totalKeys: Object.keys(flatTarget).length,
    };
}
