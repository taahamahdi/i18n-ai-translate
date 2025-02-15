import * as cl100k_base from "tiktoken/encoders/cl100k_base.json";
import { MAX_TOKEN } from "../constants";
import { Tiktoken } from "tiktoken";
import {
    TranslateItemOutputObjectSchema,
    VerifyItemOutputObjectSchema,
} from "./types_json";
import { retryJob } from "../utils";
import { translationPromptJson, verificationPromptJson } from "./prompts_json";
import type {
    GenerateStateJson,
    TranslateItem,
    TranslateItemInput,
    TranslateItemOutput,
    VerifyItemInput,
    VerifyItemOutput,
} from "./types_json";
import type { TranslationStats, TranslationStatsItem } from "../types";
import type { ZodType, ZodTypeDef } from "zod";
import type Chats from "../interfaces/chats";
import type GenerateTranslationOptionsJson from "../interfaces/generate_translation_options_json";
import type TranslateOptions from "../interfaces/translate_options";

function generateTranslateItemsInput(
    translateItems: TranslateItem[],
): TranslateItemInput[] {
    return translateItems.map(
        (translateItem) =>
            ({
                // Only adds 'context' to the object if it's not empty. Makes the prompt shorter and uses less tokens
                ...(translateItem.context !== ""
                    ? { context: translateItem.context }
                    : {}),
                ...(translateItem.failure !== ""
                    ? { failure: translateItem.failure }
                    : {}),
                id: translateItem.id,
                original: translateItem.original,
            }) as TranslateItemInput,
    );
}

function generateVerifyItemsInput(
    verifyItems: TranslateItem[],
): VerifyItemInput[] {
    return verifyItems.map(
        (verifyItem) =>
            ({
                ...(verifyItem.context !== ""
                    ? { context: verifyItem.context }
                    : {}),
                ...(verifyItem.failure !== ""
                    ? { failure: verifyItem.failure }
                    : {}),
                id: verifyItem.id,
                original: verifyItem.original,
                translated: verifyItem.translated,
            }) as VerifyItemInput,
    );
}

function generateTranslateItem(
    id: number,
    key: string,
    original: string,
    tikToken: Tiktoken,
    templatedStringRegex: RegExp,
): TranslateItem {
    const translateItem = {
        context: "",
        failure: "",
        id,
        key,
        original,
        templateStrings: [],
        translated: "",
        translationAttempts: 0,
        translationTokens: 0,
        verificationAttempts: 0,
        verificationTokens: 0,
    } as TranslateItem;

    // Maps the 'placeholders' in the translated object to make sure that none are missing
    const match = original.match(templatedStringRegex);
    if (match) {
        translateItem.templateStrings = match;
    }

    // Tokens here are used to estimate accurately the execution time
    translateItem.translationTokens = getTranslateItemToken(
        translateItem,
        tikToken,
    );

    return translateItem;
}

function getBatchTranslateItemArray(
    translateItemArray: TranslateItem[],
    options: TranslateOptions,
    tikToken: Tiktoken,
): TranslateItem[] {
    const promptTokens = tikToken.encode(
        translationPromptJson(
            options.inputLanguage,
            options.outputLanguage,
            [],
            options.overridePrompt,
        ),
    ).length;

    // Remove the tokens used by the prompt and divide the remaining tokens divided by 2 (half for the input/output) with a 10% margin of error
    const maxInputTokens = ((MAX_TOKEN - promptTokens) * 0.9) / 2;

    let currentTokens = 0;

    const batchTranslateItemArray: TranslateItem[] = [];

    for (const translateItem of translateItemArray) {
        // If a failure message is added the tokens for an item change
        currentTokens +=
            translateItem.failure !== ""
                ? getTranslateItemToken(translateItem, tikToken)
                : translateItem.translationTokens;

        if (
            batchTranslateItemArray.length !== 0 &&
            (currentTokens >= maxInputTokens ||
                batchTranslateItemArray.length >= options.batchSize)
        ) {
            break;
        }

        batchTranslateItemArray.push(translateItem);
    }

    return batchTranslateItemArray;
}

function getBatchVerifyItemArray(
    translatedItemArray: TranslateItem[],
    options: TranslateOptions,
    tikToken: Tiktoken,
): TranslateItem[] {
    const promptTokens = tikToken.encode(
        verificationPromptJson(
            options.inputLanguage,
            options.outputLanguage,
            [],
            options.overridePrompt,
        ),
    ).length;

    const maxInputTokens = ((MAX_TOKEN - promptTokens) * 0.9) / 2;

    let currentTokens = 0;

    const batchVerifyItemArray: TranslateItem[] = [];

    for (const translatedItem of translatedItemArray) {
        currentTokens +=
            translatedItem.failure !== ""
                ? getVerifyItemToken(translatedItem, tikToken)
                : translatedItem.verificationTokens;

        if (
            batchVerifyItemArray.length !== 0 &&
            (currentTokens >= maxInputTokens ||
                batchVerifyItemArray.length >= options.batchSize)
        ) {
            break;
        }

        batchVerifyItemArray.push(translatedItem);
    }

    return batchVerifyItemArray;
}

function printCompletion(
    translationStats: TranslationStatsItem,
    step: string,
): void {
    if (translationStats.processedTokens > 0) {
        console.log(
            `Step ${step}/2 - Completed ${((translationStats.processedTokens / translationStats.totalTokens) * 100).toFixed(0)}%`,
        );

        const roundedEstimatedTimeLeftSeconds = Math.round(
            (((Date.now() - translationStats.batchStartTime) /
                (translationStats.processedTokens + 1)) *
                (translationStats.totalTokens -
                    translationStats.processedTokens)) /
                1000,
        );

        console.log(
            `Estimated time left: ${roundedEstimatedTimeLeftSeconds} seconds`,
        );
    }
}

function generateTranslateItemArray(
    flatInput: any,
    tikToken: Tiktoken,
    templatedStringRegex: RegExp,
): TranslateItem[] {
    return Object.keys(flatInput).reduce((acc, key) => {
        if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
            acc.push(
                generateTranslateItem(
                    Object.keys(flatInput).indexOf(key) + 1,
                    key,
                    flatInput[key],
                    tikToken,
                    templatedStringRegex,
                ),
            );
        }

        return acc;
    }, [] as TranslateItem[]);
}

function getTranslateItemToken(
    translatedItem: TranslateItem,
    tikToken: Tiktoken,
): number {
    return tikToken.encode(
        JSON.stringify(generateTranslateItemsInput([translatedItem])[0]),
    ).length;
}

function getVerifyItemToken(
    translatedItem: TranslateItem,
    tikToken: Tiktoken,
): number {
    return tikToken.encode(
        JSON.stringify(generateVerifyItemsInput([translatedItem])[0]),
    ).length;
}

async function generateTranslationJson(
    translateItemArray: TranslateItem[],
    options: TranslateOptions,
    chats: Chats,
    translationStats: TranslationStatsItem,
    tikToken: Tiktoken,
    templatedStringRegex: RegExp,
): Promise<TranslateItem[]> {
    const generatedTranslation: TranslateItem[] = [];
    translationStats.totalItems = translateItemArray.length;
    translationStats.totalTokens = translateItemArray.reduce(
        (sum, translateItem) => sum + translateItem.translationTokens,
        0,
    );

    translationStats.batchStartTime = Date.now();

    // translate items are removed from 'translateItemArray' when one is generated
    // this is done to avoid 'losing' items if the model doesn't return one
    while (translateItemArray.length > 0) {
        if (options.verbose) {
            printCompletion(translationStats, "1");
        }

        const batchTranslateItemArray = getBatchTranslateItemArray(
            translateItemArray,
            options,
            tikToken,
        );

        for (const batchTranslateItem of batchTranslateItemArray) {
            batchTranslateItem.translationAttempts++;
            if (batchTranslateItem.translationAttempts > 10) {
                return Promise.reject(
                    new Error(
                        `Item failed to translate too many times: ${JSON.stringify(batchTranslateItem)}. If this persists try a different model`,
                    ),
                );
            }
        }

        translationStats.enqueuedItems += batchTranslateItemArray.length;

        // eslint-disable-next-line no-await-in-loop
        const result = await runTranslationJob(
            {
                chats,
                ensureChangedTranslation:
                    options.ensureChangedTranslation ?? false,
                inputLanguage: `[${options.inputLanguage}]`,
                outputLanguage: `[${options.outputLanguage}]`,
                overridePrompt: options.overridePrompt,
                skipStylingVerification:
                    options.skipStylingVerification ?? false,
                skipTranslationVerification:
                    options.skipTranslationVerification ?? false,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                translateItems: batchTranslateItemArray,
                verboseLogging: options.verbose ?? false,
            },
            templatedStringRegex,
        );

        if (!result) {
            console.error(
                `Failed to generate translation for ${options.outputLanguage}`,
            );
            break;
        }

        for (const translatedItem of result) {
            // Check if the translated item exists in the untranslated item array
            const index = translateItemArray.findIndex(
                (item) => item.id === translatedItem.id,
            );

            if (index !== -1) {
                // If it does remove it from the 'translateItemArray' used to queue items for translation
                translateItemArray.splice(index, 1);
                // Prepare the object then add it to results
                translatedItem.verificationTokens = getVerifyItemToken(
                    translatedItem,
                    tikToken,
                );
                generatedTranslation.push(translatedItem);
                translationStats.processedTokens +=
                    translatedItem.translationTokens;
            }

            translationStats.processedItems++;
        }
    }

    if (options.verbose) {
        const endTime = Date.now();
        const roundedSeconds = Math.round(
            (endTime - translationStats.batchStartTime) / 1000,
        );

        console.log(`Translation execution time: ${roundedSeconds} seconds`);
    }

    return generatedTranslation;
}

async function generateVerificationJson(
    verifyItemArray: TranslateItem[],
    options: TranslateOptions,
    chats: Chats,
    translationStats: TranslationStatsItem,
    tikToken: Tiktoken,
    templatedStringRegex: RegExp,
): Promise<TranslateItem[]> {
    const generatedVerification: TranslateItem[] = [];
    translationStats.totalItems = verifyItemArray.length;
    translationStats.totalTokens = verifyItemArray.reduce(
        (sum, verifyItem) => sum + verifyItem.verificationTokens,
        0,
    );

    translationStats.batchStartTime = Date.now();

    while (verifyItemArray.length > 0) {
        if (options.verbose) {
            printCompletion(translationStats, "2");
        }

        const batchVerifyItemArray = getBatchVerifyItemArray(
            verifyItemArray,
            options,
            tikToken,
        );

        for (const batchVerifyItem of batchVerifyItemArray) {
            batchVerifyItem.verificationAttempts++;
            if (batchVerifyItem.verificationAttempts > 10) {
                return Promise.reject(
                    new Error(
                        `Item failed to verify too many times: ${JSON.stringify(batchVerifyItem)}. If this persists try a different model`,
                    ),
                );
            }
        }

        translationStats.enqueuedItems += batchVerifyItemArray.length;

        // eslint-disable-next-line no-await-in-loop
        const result = await runVerificationJob(
            {
                chats,
                ensureChangedTranslation:
                    options.ensureChangedTranslation ?? false,
                inputLanguage: `[${options.inputLanguage}]`,
                outputLanguage: `[${options.outputLanguage}]`,
                overridePrompt: options.overridePrompt,
                skipStylingVerification:
                    options.skipStylingVerification ?? false,
                skipTranslationVerification:
                    options.skipTranslationVerification ?? false,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                translateItems: batchVerifyItemArray,
                verboseLogging: options.verbose ?? false,
            },
            templatedStringRegex,
        );

        if (!result) {
            console.error(
                `Failed to generate translation for ${options.outputLanguage}`,
            );
            break;
        }

        for (const translatedItem of result) {
            const index = verifyItemArray.findIndex(
                (item) => item.id === translatedItem.id,
            );

            if (index !== -1) {
                verifyItemArray.splice(index, 1);
                generatedVerification.push(translatedItem);
                translationStats.processedTokens +=
                    translatedItem.verificationTokens;
            }

            translationStats.processedItems++;
        }
    }

    if (options.verbose) {
        const endTime = Date.now();
        const roundedSeconds = Math.round(
            (endTime - translationStats.batchStartTime) / 1000,
        );

        console.log(`Verification execution time: ${roundedSeconds} seconds`);
    }

    return generatedVerification;
}

function convertTranslateItemToIndex(generatedTranslation: TranslateItem[]): {
    [key: string]: string;
} {
    return generatedTranslation.reduce(
        (acc, translation) => {
            acc[translation.key] = translation.translated;
            return acc;
        },
        {} as { [key: string]: string },
    );
}

/**
 * Complete the initial translation of the input text.
 * @param flatInput - The flatinput object containing the json to translate
 * @param options - The options to generate the translation
 * @param chats - The options to generate the translation
 * @param translationStats - The translation statictics
 */
export default async function translateJson(
    flatInput: { [key: string]: string },
    options: TranslateOptions,
    chats: Chats,
    translationStats: TranslationStats,
): Promise<{ [key: string]: string }> {
    const tikToken = new Tiktoken(
        cl100k_base.bpe_ranks,
        cl100k_base.special_tokens,
        cl100k_base.pat_str,
    );

    const templatedStringRegex = new RegExp(
        `${options.templatedStringPrefix}[^{}]+${options.templatedStringSuffix}`,
        "g",
    );

    const translateItemArray = generateTranslateItemArray(
        flatInput,
        tikToken,
        templatedStringRegex,
    );

    const generatedTranslation = await generateTranslationJson(
        translateItemArray,
        options,
        chats,
        translationStats.translate,
        tikToken,
        templatedStringRegex,
    );

    if (!options.skipTranslationVerification) {
        if (options.verbose) {
            console.log("Starting verification...");
        }

        const generatedVerification = await generateVerificationJson(
            generatedTranslation,
            options,
            chats,
            translationStats.verify,
            tikToken,
            templatedStringRegex,
        );

        return convertTranslateItemToIndex(generatedVerification);
    }

    return convertTranslateItemToIndex(generatedTranslation);
}

function parseTranslationToJson(outputText: string): TranslateItemOutput[] {
    try {
        return TranslateItemOutputObjectSchema.parse(JSON.parse(outputText))
            .items;
    } catch (error) {
        console.error("Error parsing JSON:", error, outputText);
        return [];
    }
}

function parseVerificationToJson(outputText: string): VerifyItemOutput[] {
    try {
        return VerifyItemOutputObjectSchema.parse(JSON.parse(outputText)).items;
    } catch (error) {
        console.error("Error parsing JSON:", error, outputText);
        return [];
    }
}

function isValidTranslateItem(item: any): item is TranslateItemOutput {
    return (
        typeof item.id === "number" &&
        typeof item.translated === "string" &&
        item.id > 0 &&
        item.translated !== ""
    );
}

function isValidVerificationItem(item: any): item is VerifyItemOutput {
    if (!(typeof item.id === "number")) return false;
    if (!(typeof item.valid === "boolean")) return false;
    if (item.id <= 0) return false;
    // 'fixedTranslation' should be a translation if valid is false
    if (
        item.valid === false &&
        (!(typeof item.fixedTranslation === "string") ||
            item.fixedTranslation === "")
    )
        return false;

    return true;
}

function getMissingVariables(arr1: string[], arr2: string[]): string[] {
    if (arr1.length === 0) return [];

    const set2 = new Set(arr2);
    const missing = arr1.filter((item) => !set2.has(item));

    return missing;
}

function createTranslateItemsWithTranslation(
    untranslatedItems: TranslateItem[],
    translatedItems: TranslateItemOutput[],
    templatedStringRegex: RegExp,
): TranslateItem[] {
    const output: TranslateItem[] = [];

    for (const untranslatedItem of untranslatedItems) {
        const translatedItem = translatedItems.find(
            (checkTranslatedItem) =>
                untranslatedItem.id === checkTranslatedItem.id,
        );

        if (translatedItem) {
            const templateStrings =
                translatedItem.translated.match(templatedStringRegex) ?? [];

            const missingVariables = getMissingVariables(
                untranslatedItem.templateStrings,
                templateStrings,
            );

            if (missingVariables.length === 0) {
                output.push({
                    ...untranslatedItem,
                    failure: "",
                    translated: translatedItem.translated,
                } as TranslateItem);
            } else {
                // Item is updated with a failure message. This message gives the LLM a context to help it fix the translation.
                // Without this the same error is made over and over again, with the message the new translation is generally accepted.
                untranslatedItem.failure = `Must add variables, missing from last translation: '${JSON.stringify(missingVariables)}'`;
                console.log(untranslatedItem.templateStrings, templateStrings);
                console.log(
                    untranslatedItem.original,
                    translatedItem.translated,
                );
            }
        }
    }

    return output;
}

function createVerifyItemsWithTranslation(
    translatedItemArray: TranslateItem[],
    verifiedItemArray: VerifyItemOutput[],
    templatedStringRegex: RegExp,
): TranslateItem[] {
    const output: TranslateItem[] = [];

    for (const translatedItem of translatedItemArray) {
        const verifiedItem = verifiedItemArray.find(
            (checkVerifiedItem) => translatedItem.id === checkVerifiedItem.id,
        );

        if (verifiedItem) {
            if (verifiedItem.valid) {
                output.push({
                    ...translatedItem,
                    failure: "",
                } as TranslateItem);
            } else if (
                verifiedItem.fixedTranslation &&
                verifiedItem.fixedTranslation !== ""
            ) {
                const templateStrings =
                    verifiedItem.fixedTranslation.match(templatedStringRegex) ??
                    [];

                const missingVariables = getMissingVariables(
                    translatedItem.templateStrings,
                    templateStrings,
                );

                if (missingVariables.length === 0) {
                    // 'translatedItem' is updated and queued again to check if the new fixed translation is valid
                    translatedItem.translated =
                        verifiedItem.fixedTranslation as string;
                    translatedItem.failure = `Previous issue that should be corrected: '${verifiedItem.issue}'`;
                    console.log(translatedItem);
                } else {
                    translatedItem.failure = `Must add variables, missing from last translation: '${JSON.stringify(missingVariables)}'`;
                    console.log(
                        translatedItem.templateStrings,
                        templateStrings,
                    );

                    console.log(
                        translatedItem.original,
                        verifiedItem.fixedTranslation,
                    );
                }
            }
        }
    }

    return output;
}

async function runTranslationJob(
    options: GenerateTranslationOptionsJson,
    templatedStringRegex: RegExp,
): Promise<TranslateItem[]> {
    const generateState: GenerateStateJson = {
        fixedTranslationMappings: {},
        generationRetries: 0,
        translationToRetryAttempts: {},
    };

    const generationPromptText = translationPromptJson(
        options.inputLanguage,
        options.outputLanguage,
        generateTranslateItemsInput(options.translateItems),
        options.overridePrompt,
    );

    let translated = "";
    try {
        translated = await retryJob(
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            generateJob,
            [
                generationPromptText,
                options,
                generateState,
                TranslateItemOutputObjectSchema,
            ],
            25,
            true,
            0,
            false,
        );
    } catch (e) {
        console.error(`Failed to translate: ${e}`);
    }

    const parsedOutput = parseTranslationToJson(translated);
    const validTranslationObjects = parsedOutput.filter(isValidTranslateItem);

    return createTranslateItemsWithTranslation(
        options.translateItems,
        validTranslationObjects,
        templatedStringRegex,
    );
}

async function runVerificationJob(
    options: GenerateTranslationOptionsJson,
    templatedStringRegex: RegExp,
): Promise<TranslateItem[]> {
    const generateState: GenerateStateJson = {
        fixedTranslationMappings: {},
        generationRetries: 0,
        translationToRetryAttempts: {},
    };

    const generationPromptText = verificationPromptJson(
        options.inputLanguage,
        options.outputLanguage,
        generateVerifyItemsInput(options.translateItems),
        options.overridePrompt,
    );

    let verified = "";
    try {
        verified = await retryJob(
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            generateJob,
            [
                generationPromptText,
                options,
                generateState,
                VerifyItemOutputObjectSchema,
            ],
            25,
            true,
            0,
            false,
        );
    } catch (e) {
        console.error(`Failed to translate: ${e}`);
    }

    const parsedOutput = parseVerificationToJson(verified);
    const validTranslationObjects = parsedOutput.filter(
        isValidVerificationItem,
    );

    return createVerifyItemsWithTranslation(
        options.translateItems,
        validTranslationObjects,
        templatedStringRegex,
    );
}

function verifyGenerationAndRetry(
    generationPromptText: string,
    options: GenerateTranslationOptionsJson,
    generateState: GenerateStateJson,
): Promise<string> {
    generateState.generationRetries++;
    if (generateState.generationRetries > 10) {
        options.chats.generateTranslationChat.resetChatHistory();
        return Promise.reject(
            new Error(
                "Failed to generate content due to exception. Resetting history.",
            ),
        );
    }

    console.error(`Erroring text = ${generationPromptText}`);
    options.chats.generateTranslationChat.rollbackLastMessage();
    return Promise.reject(
        new Error("Failed to generate content due to exception."),
    );
}

async function generateJob(
    generationPromptText: string,
    options: GenerateTranslationOptionsJson,
    generateState: GenerateStateJson,
    format: ZodType<any, ZodTypeDef, any>,
): Promise<string> {
    const text = await options.chats.generateTranslationChat.sendMessage(
        generationPromptText,
        format,
    );

    if (!text) {
        return verifyGenerationAndRetry(
            generationPromptText,
            options,
            generateState,
        );
    } else {
        generateState.generationRetries = 0;
    }

    return text;
}
