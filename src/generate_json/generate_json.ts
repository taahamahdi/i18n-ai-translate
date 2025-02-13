import * as cl100k_base from "tiktoken/encoders/cl100k_base.json";
import { DEFAULT_BATCH_SIZE, MAX_TOKEN } from "src/constants";
import { Tiktoken } from "tiktoken";
import { TranslateItemOutputObjectSchema } from "./types_json";
import { generationPromptJson } from "./prompts_json";
import { retryJob } from "src/utils";
import type { GenerateState, TranslationStats } from "src/types";
import type {
    TranslateItem,
    TranslateItemInput,
    TranslateItemOutput,
} from "./types_json";
import type Chats from "src/interfaces/chats";
import type GenerateTranslationOptionsJson from "src/interfaces/generate_translation_options_json";
import type TranslateOptions from "src/interfaces/translate_options";

function createJsonInput(
    id: number,
    key: string,
    original: string,
): TranslateItem {
    const translateItem = {
        // context: "",
        id,
        key,
        original,
        tokens: 0,
        translated: "",
    } as TranslateItem;

    translateItem.tokens = getTokenCount(
        JSON.stringify(getTranslateItemsInput([translateItem])[0]),
    );

    return translateItem;
}

function getTranslateItemsInput(
    translateItems: TranslateItem[],
): TranslateItemInput[] {
    return translateItems.map(
        (translateItem) =>
            ({
                context: translateItem.context,
                id: translateItem.id,
                original: translateItem.original,
            }) as TranslateItemInput,
    );
}

function getTokenCount(text: string): number {
    const encoding = new Tiktoken(
        cl100k_base.bpe_ranks,
        cl100k_base.special_tokens,
        cl100k_base.pat_str,
    );

    return encoding.encode(text).length;
}

function getBatchTranslateItemArray(
    translateItemArray: TranslateItem[],
    options: TranslateOptions,
): TranslateItem[] {
    const promptTokens = getTokenCount(
        generationPromptJson(
            options.inputLanguage,
            options.outputLanguage,
            [],
            options.overridePrompt,
        ),
    );

    const maxInputTokens = ((MAX_TOKEN - promptTokens) * 0.9) / 2;

    let currentTokens = 0;

    const batchTranslateItemArray: TranslateItem[] = [];

    for (const translateItem of translateItemArray) {
        currentTokens += translateItem.tokens;

        if (
            batchTranslateItemArray.length !== 0 &&
            (currentTokens >= maxInputTokens ||
                batchTranslateItemArray.length >=
                    Number(options.batchSize ?? DEFAULT_BATCH_SIZE))
        ) {
            break;
        }

        batchTranslateItemArray.push(translateItem);
    }

    return batchTranslateItemArray;
}

function printCompletion(
    options: TranslateOptions,
    translationStats: TranslationStats,
): void {
    if (translationStats.processedItems > 0 && options.verbose) {
        console.log(
            `Step 1/2 - Completed ${((translationStats.processedTokens / translationStats.totalTokens) * 100).toFixed(0)}%`,
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
    const translateItemArray: TranslateItem[] = [];

    for (let i = 0; i < Object.keys(flatInput).length; i++) {
        const key = Object.keys(flatInput)[i];
        if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
            translateItemArray.push(
                createJsonInput(i + 1, key, flatInput[key]),
            );
        }
    }

    const generatedTranslation: TranslateItem[] = [];
    translationStats.totalItems = translateItemArray.length;
    translationStats.totalTokens = translateItemArray.reduce(
        (sum, translateItem) => sum + translateItem.tokens,
        0,
    );

    while (translateItemArray.length > 0) {
        printCompletion(options, translationStats);

        const batchTranslateItemArray = getBatchTranslateItemArray(
            translateItemArray,
            options,
        );

        translationStats.enqueuedItems += batchTranslateItemArray.length;

        // eslint-disable-next-line no-await-in-loop
        const result = await generateTranslationJson({
            chats,
            ensureChangedTranslation: options.ensureChangedTranslation ?? false,
            inputLanguage: `[${options.inputLanguage}]`,
            outputLanguage: `[${options.outputLanguage}]`,
            overridePrompt: options.overridePrompt,
            skipStylingVerification: options.skipStylingVerification ?? false,
            skipTranslationVerification:
                options.skipTranslationVerification ?? false,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            translateItems: batchTranslateItemArray,
            verboseLogging: options.verbose ?? false,
        });

        // console.log(result);
        if (!result) {
            console.error(
                `Failed to generate translation for ${options.outputLanguage}`,
            );
            break;
        }

        for (const translatedItem of result) {
            const index = translateItemArray.findIndex(
                (item) => item.id === translatedItem.id,
            );

            if (index !== -1) {
                translateItemArray.splice(index, 1);
                generatedTranslation.push(translatedItem);
                translationStats.processedTokens += translatedItem.tokens;
            }

            translationStats.processedItems++;
        }
    }

    const output: { [key: string]: string } = {};

    // Convert array of TranslateItem objects to output
    for (const translation of generatedTranslation) {
        output[translation.key] = translation.translated;
    }

    return output;
}

async function generateTranslationJson(
    options: GenerateTranslationOptionsJson,
): Promise<TranslateItem[]> {
    const generationPromptText = generationPromptJson(
        options.inputLanguage,
        options.outputLanguage,
        getTranslateItemsInput(options.translateItems),
        options.overridePrompt,
    );

    const generateState: GenerateState = {
        fixedTranslationMappings: {},
        generationRetries: 0,
        inputLineToTemplatedString: {},
        splitInput: [],
        translationToRetryAttempts: {},
    };

    let translated: TranslateItem[] = [];
    try {
        translated = await retryJob(
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            generate,
            [options, generationPromptText, generateState],
            25,
            true,
            0,
            false,
        );
    } catch (e) {
        console.error(`Failed to translate: ${e}`);
    }

    return translated;
}

function parseOutputToJson(outputText: string): TranslateItemOutput[] {
    try {
        return TranslateItemOutputObjectSchema.parse(JSON.parse(outputText))
            .items;
    } catch (error) {
        console.error("Error parsing JSON:", error, outputText);
        return [];
    }
}

function isValidTranslateItem(item: any): item is TranslateItem {
    return (
        typeof item.id === "number" &&
        typeof item.translated === "string" &&
        item.id > 0 &&
        item.translated !== ""
    );
}

function verifyGenerationAndRetry(
    options: GenerateTranslationOptionsJson,
    generateState: GenerateState,
): Promise<TranslateItem[]> {
    generateState.generationRetries++;
    if (generateState.generationRetries > 10) {
        options.chats.generateTranslationChat.resetChatHistory();
        return Promise.reject(
            new Error(
                "Failed to generate content due to exception. Resetting history.",
            ),
        );
    }

    console.error(`Erroring text = ${options.translateItems}`);
    options.chats.generateTranslationChat.rollbackLastMessage();
    return Promise.reject(
        new Error("Failed to generate content due to exception."),
    );
}

function createTranslateItemsWithTranslation(
    untranslatedItems: TranslateItem[],
    translatedItems: TranslateItemOutput[],
): TranslateItem[] {
    const output: TranslateItem[] = [];

    for (const untranslatedItem of untranslatedItems) {
        const translatedItem = translatedItems.find(
            (checkTranslatedItem) =>
                untranslatedItem.id === checkTranslatedItem.id,
        );

        if (translatedItem) {
            output.push({
                context: untranslatedItem.context,
                id: untranslatedItem.id,
                key: untranslatedItem.key,
                original: untranslatedItem.original,
                tokens: untranslatedItem.tokens,
                translated: translatedItem.translated,
            } as TranslateItem);
        }
    }

    return output;
}

async function generate(
    options: GenerateTranslationOptionsJson,
    generationPromptText: string,
    generateState: GenerateState,
): Promise<TranslateItem[]> {
    // console.log(generationPromptText);
    const text = await options.chats.generateTranslationChat.sendMessage(
        generationPromptText,
        TranslateItemOutputObjectSchema,
    );

    console.log(generationPromptText);
    if (!text) {
        return verifyGenerationAndRetry(options, generateState);
    } else {
        generateState.generationRetries = 0;
    }

    const parsedOutput = parseOutputToJson(text);
    const validTranslationObjects = parsedOutput.filter(isValidTranslateItem);

    return createTranslateItemsWithTranslation(
        options.translateItems,
        validTranslationObjects,
    );
}
