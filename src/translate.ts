import {
    DEFAULT_BATCH_SIZE,
    DEFAULT_REQUEST_TOKENS,
    DEFAULT_TEMPLATED_STRING_PREFIX,
    DEFAULT_TEMPLATED_STRING_SUFFIX,
    FLATTEN_DELIMITER,
} from "./constants";
import { distance } from "fastest-levenshtein";
import { flatten, unflatten } from "flat";
import { printExecutionTime, printInfo } from "./utils";
import ChatFactory from "./chats/chat_factory";
import GenerateTranslationJSON from "./generate_json/generate";
import PromptMode from "./enums/prompt_mode";
import RateLimiter from "./rate_limiter";
import translateCSV from "./generate_csv/generate";
import type { TranslationStats, TranslationStatsItem } from "./types";
import type Chats from "./interfaces/chats";
import type TranslateDiffOptions from "./interfaces/translate_diff_options";
import type TranslateOptions from "./interfaces/translate_options";

function getChats(options: TranslateOptions): Chats {
    const rateLimiter = new RateLimiter(
        options.rateLimitMs,
        options.verbose as boolean,
    );

    return {
        generateTranslationChat: ChatFactory.newChat(
            options.engine,
            options.model,
            rateLimiter,
            options.apiKey,
            options.host,
            options.chatParams,
        ),
        verifyStylingChat: ChatFactory.newChat(
            options.engine,
            options.model,
            rateLimiter,
            options.apiKey,
            options.host,
            options.chatParams,
        ),
        verifyTranslationChat: ChatFactory.newChat(
            options.engine,
            options.model,
            rateLimiter,
            options.apiKey,
            options.host,
            options.chatParams,
        ),
    };
}

function replaceNewlinesWithPlaceholder(
    templatedStringPrefix: string,
    templatedStringSuffix: string,
    flatInput: { [key: string]: string },
): void {
    for (const key in flatInput) {
        if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
            flatInput[key] = flatInput[key].replaceAll(
                "\n",
                `${templatedStringPrefix}NEWLINE${templatedStringSuffix}`,
            );
        }
    }
}

function replacePlaceholderWithNewLines(
    templatedStringPrefix: string,
    templatedStringSuffix: string,
    sortedOutput: { [key: string]: string },
): void {
    for (const key in sortedOutput) {
        if (Object.prototype.hasOwnProperty.call(sortedOutput, key)) {
            sortedOutput[key] = sortedOutput[key].replaceAll(
                `${templatedStringPrefix}NEWLINE${templatedStringSuffix}`,
                "\n",
            );
        }
    }
}

function groupSimilarValues(flatInput: { [key: string]: string }): {
    [key: string]: string;
} {
    const groups: Array<{ [key: string]: string }> = [];
    for (const key in flatInput) {
        if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
            const val = flatInput[key];

            const existingGroup = groups.find((group) =>
                Object.values(group).some((entry) => {
                    const distPercent =
                        distance(val, entry) /
                        Math.max(val.length, entry.length);

                    return distPercent < 0.3;
                }),
            );

            if (existingGroup) {
                existingGroup[key] = val;
            } else {
                groups.push({ [key]: val });
            }
        }
    }

    for (let i = groups.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [groups[i], groups[j]] = [groups[j], groups[i]];
    }

    flatInput = {};
    for (const groupObj of groups) {
        for (const [k, v] of Object.entries(groupObj)) {
            flatInput[k] = v;
        }
    }

    return flatInput;
}

function startTranslationStatsItem(): TranslationStatsItem {
    return {
        batchStartTime: 0,
        enqueuedItems: 0,
        processedItems: 0,
        processedTokens: 0,
        totalItems: 0,
        totalTokens: 0,
    } as TranslationStatsItem;
}

function startTranslationStats(): TranslationStats {
    return {
        translate: startTranslationStatsItem(),
        verify: startTranslationStatsItem(),
    } as TranslationStats;
}

async function getTranslation(
    flatInput: { [key: string]: string },
    options: TranslateOptions,
    chats: Chats,
    translationStats: TranslationStats,
): Promise<{ [key: string]: string }> {
    if (options.verbose) {
        printInfo(`Translation prompting mode: ${options.promptMode}\n`);
    }

    switch (options.promptMode) {
        case PromptMode.JSON: {
            const generateTranslationJSON = new GenerateTranslationJSON(
                options,
            );

            return generateTranslationJSON.translateJSON(
                flatInput,
                options,
                chats,
                translationStats,
            );
        }

        case PromptMode.CSV:
            return translateCSV(
                flatInput,
                options,
                chats,
                translationStats.translate,
            );
        default:
            throw new Error("Prompt mode is not set");
    }
}

function setDefaults(options: TranslateOptions): void {
    if (!options.templatedStringPrefix)
        options.templatedStringPrefix = DEFAULT_TEMPLATED_STRING_PREFIX;
    if (!options.templatedStringSuffix)
        options.templatedStringSuffix = DEFAULT_TEMPLATED_STRING_SUFFIX;
    if (!options.batchMaxTokens)
        options.batchMaxTokens = DEFAULT_REQUEST_TOKENS;
    if (!options.batchSize) options.batchSize = DEFAULT_BATCH_SIZE;
    if (!options.verbose) options.verbose = false;
    if (!options.ensureChangedTranslation)
        options.ensureChangedTranslation = false;
    if (!options.skipTranslationVerification)
        options.skipTranslationVerification = false;
    if (!options.skipStylingVerification)
        options.skipStylingVerification = false;
}

/**
 * Translate the input JSON to the given language
 * @param options - The options for the translation
 */
export async function translate(options: TranslateOptions): Promise<Object> {
    setDefaults(options);

    if (options.verbose) {
        printInfo(
            `Translating from ${options.inputLanguage} to ${options.outputLanguage}...`,
        );
    }

    const chats: Chats = getChats(options);

    let flatInput = flatten(options.inputJSON, {
        delimiter: FLATTEN_DELIMITER,
    }) as {
        [key: string]: string;
    };

    replaceNewlinesWithPlaceholder(
        options.templatedStringPrefix as string,
        options.templatedStringSuffix as string,
        flatInput,
    );

    flatInput = groupSimilarValues(flatInput);

    const translationStats = startTranslationStats();

    const output = await getTranslation(
        flatInput,
        options,
        chats,
        translationStats,
    );

    // sort the keys
    const sortedOutput: { [key: string]: string } = {};
    for (const key of Object.keys(flatInput).sort()) {
        sortedOutput[key] = output[key];
    }

    replacePlaceholderWithNewLines(
        options.templatedStringPrefix as string,
        options.templatedStringSuffix as string,
        sortedOutput,
    );

    const unflattenedOutput = unflatten(sortedOutput, {
        delimiter: FLATTEN_DELIMITER,
    });

    if (options.verbose) {
        printExecutionTime(
            translationStats.translate.batchStartTime,
            "Total execution time: ",
        );
    }

    return unflattenedOutput as Object;
}

/**
 * Translate the difference of an input JSON to the given languages
 * @param options - The options for the translation
 */
export async function translateDiff(
    options: TranslateDiffOptions,
): Promise<{ [language: string]: Object }> {
    const flatInputBefore = flatten(options.inputJSONBefore, {
        delimiter: FLATTEN_DELIMITER,
    }) as {
        [key: string]: string;
    };

    const flatInputAfter = flatten(options.inputJSONAfter, {
        delimiter: FLATTEN_DELIMITER,
    }) as {
        [key: string]: string;
    };

    const flatToUpdateJSONs: { [language: string]: { [key: string]: string } } =
        {};

    for (const lang in options.toUpdateJSONs) {
        if (Object.prototype.hasOwnProperty.call(options.toUpdateJSONs, lang)) {
            const flatToUpdateJSON = flatten(options.toUpdateJSONs[lang], {
                delimiter: FLATTEN_DELIMITER,
            }) as {
                [key: string]: string;
            };

            flatToUpdateJSONs[lang] = flatToUpdateJSON;
        }
    }

    const addedKeys = [];
    const modifiedKeys = [];
    const deletedKeys = [];

    for (const key in flatInputBefore) {
        if (flatInputBefore[key] !== flatInputAfter[key]) {
            if (flatInputAfter[key] === undefined) {
                deletedKeys.push(key);
            } else {
                modifiedKeys.push(key);
            }
        }
    }

    for (const key in flatInputAfter) {
        if (flatInputBefore[key] === undefined) {
            addedKeys.push(key);
        }
    }

    if (options.verbose) {
        printInfo(`Added keys: ${addedKeys.join("\n")}\n`);
        printInfo(`Modified keys: ${modifiedKeys.join("\n")}\n`);
        printInfo(`Deleted keys: ${deletedKeys.join("\n")}\n`);
    }

    for (const key of deletedKeys) {
        for (const lang in flatToUpdateJSONs) {
            if (Object.prototype.hasOwnProperty.call(flatToUpdateJSONs, lang)) {
                delete flatToUpdateJSONs[lang][key];
            }
        }
    }

    const translatedJSONs: { [language: string]: { [key: string]: string } } =
        {};

    for (const languageCode in flatToUpdateJSONs) {
        if (
            Object.prototype.hasOwnProperty.call(
                flatToUpdateJSONs,
                languageCode,
            )
        ) {
            translatedJSONs[languageCode] = {};
            const addedAndModifiedTranslations: { [key: string]: string } = {};
            for (const key of addedKeys) {
                addedAndModifiedTranslations[key] = flatInputAfter[key];
            }

            for (const key of modifiedKeys) {
                addedAndModifiedTranslations[key] = flatInputAfter[key];
            }

            // eslint-disable-next-line no-await-in-loop
            const translated = await translate({
                apiKey: options.apiKey,
                batchMaxTokens: options.batchMaxTokens,
                batchSize: options.batchSize,
                chatParams: options.chatParams,
                engine: options.engine,
                ensureChangedTranslation: options.ensureChangedTranslation,
                host: options.host,
                inputJSON: addedAndModifiedTranslations,
                inputLanguage: options.inputLanguage,
                model: options.model,
                outputLanguage: languageCode,
                overridePrompt: options.overridePrompt,
                promptMode: options.promptMode,
                rateLimitMs: options.rateLimitMs,
                skipStylingVerification: options.skipStylingVerification,
                skipTranslationVerification:
                    options.skipTranslationVerification,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                verbose: options.verbose,
            });

            const flatTranslated = flatten(translated, {
                delimiter: FLATTEN_DELIMITER,
            }) as {
                [key: string]: string;
            };

            for (const key in flatTranslated) {
                if (Object.prototype.hasOwnProperty.call(flatTranslated, key)) {
                    translatedJSONs[languageCode][key] = flatTranslated[key];
                }
            }

            // Sort the keys
            translatedJSONs[languageCode] = Object.keys(
                translatedJSONs[languageCode],
            )
                .sort()
                .reduce(
                    (obj, key) => {
                        obj[key] = translatedJSONs[languageCode][key];
                        return obj;
                    },
                    {} as { [key: string]: string },
                );
        }
    }

    const unflatToUpdateJSONs: { [language: string]: Object } = {};
    for (const lang in translatedJSONs) {
        if (Object.prototype.hasOwnProperty.call(translatedJSONs, lang)) {
            unflatToUpdateJSONs[lang] = unflatten(translatedJSONs[lang], {
                delimiter: FLATTEN_DELIMITER,
            });
        }
    }

    return unflatToUpdateJSONs;
}
