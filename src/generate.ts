import { generationPrompt } from "./prompts";
import { retryJob } from "./utils";
import type { TranslateItem } from "./types";
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
        translateItems,
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

function parseOutputToJson(outputText: string): any[] {
    const match = outputText.match(/```json\n([\s\S]*?)\n```/); // looks for ```json ...content... ```
    if (match) {
        const jsonContent = match[1]; // Extracted JSON string
        try {
            const parsedJson = JSON.parse(jsonContent);
            return parsedJson;
        } catch (error) {
            console.error("Error parsing JSON:", error, jsonContent);
            return [];
        }
    } else {
        console.log("No JSON found.", outputText);
        return [];
    }
}

function isValidTranslateItem(item: any): item is TranslateItem {
    return (
        typeof item.key === "string" &&
        typeof item.originalText === "string" &&
        typeof item.translatedText === "string" &&
        typeof item.context === "string" &&
        item.key !== "" &&
        item.translatedText !== ""
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
    translatedItems: TranslateItem[],
): TranslateItem[] {
    const output: TranslateItem[] = [];

    for (const untranslatedItem of untranslatedItems) {
        const translatedItem = translatedItems.find(
            (checkTranslatedItem) =>
                untranslatedItem.key === checkTranslatedItem.key,
        );

        if (translatedItem) {
            output.push({
                context: untranslatedItem.context,
                key: untranslatedItem.key,
                originalText: untranslatedItem.originalText,
                translatedText: translatedItem.translatedText,
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
    const text =
        await options.chats.generateTranslationChat.sendMessage(
            generationPromptText,
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
