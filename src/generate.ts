import { generationPrompt } from "./prompts";
import { retryJob } from "./utils";
import {
    TranslateItem,
    TranslateItemOutput,
    TranslateItemInput,
    TranslateItemOutputObjectSchema,
} from "./types";
import type GenerateTranslationOptions from "./interfaces/generate_translation_options";

type GenerateState = {
    fixedTranslationMappings: { [input: string]: string };
    translationToRetryAttempts: { [translation: string]: number };
    inputLineToTemplatedString: { [index: number]: Array<string> };
    generationRetries: number;
};

/**
 * Complete the initial translation of the input text.
 * @param options - The options to generate the translation
 */
export default async function generateTranslation(
    options: GenerateTranslationOptions,
): Promise<TranslateItem[]> {
    const { translateItems, inputLanguage, outputLanguage } = options;

    const generationPromptText = generationPrompt(
        inputLanguage,
        outputLanguage,
        getTranslateItemsInput(translateItems),
        options.overridePrompt,
    );

    const generateState: GenerateState = {
        fixedTranslationMappings: {},
        generationRetries: 0,
        inputLineToTemplatedString: {},
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

function getTranslateItemsInput(
    translateItems: TranslateItem[],
): TranslateItemInput[] {
    return translateItems.map(
        (translateItem) =>
            ({
                id: translateItem.id,
                original: translateItem.original,
                context: translateItem.context,
            }) as TranslateItemInput,
    );
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
    options: GenerateTranslationOptions,
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
                id: untranslatedItem.id,
                context: untranslatedItem.context,
                key: untranslatedItem.key,
                original: untranslatedItem.original,
                translated: translatedItem.translated,
            } as TranslateItem);
        }
    }

    return output;
}

async function generate(
    options: GenerateTranslationOptions,
    generationPromptText: string,
    generateState: GenerateState,
): Promise<TranslateItem[]> {
    // console.log(generationPromptText);
    const text = await options.chats.generateTranslationChat.sendMessage(
        generationPromptText,
        TranslateItemOutputObjectSchema,
        "TranslateItemOutputObjectSchema",
    );

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
