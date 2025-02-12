import { TranslateItemOutputObjectSchema } from "./types_json";
import { generationPromptJson } from "./prompts_json";
import { retryJob } from "src/utils";
import type { GenerateState } from "src/types";
import type {
    TranslateItem,
    TranslateItemInput,
    TranslateItemOutput,
} from "./types_json";
import type GenerateTranslationOptionsJson from "src/interfaces/generate_translation_options_json";

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

/**
 * Complete the initial translation of the input text.
 * @param options - The options to generate the translation
 */
export default async function generateTranslationJson(
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
