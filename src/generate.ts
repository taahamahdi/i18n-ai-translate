import { fixTranslation } from "./fix_translation";
import { generationPrompt } from "./prompts";
import { isNAK, retryJob } from "./utils";
import { verifyStyling, verifyTranslation } from "./verify";
import type {
    CheckTranslateItem,
    RetranslateItem,
    TranslateItem,
    TranslateItemResult,
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
): Promise<TranslateItemResult[]> {
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

    let translated: TranslateItemResult[] = [];
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

function parseOutputToJson(
    outputText: string,
    options: GenerateTranslationOptions,
): any[] {
    const match = outputText.match(/```json\n([\s\S]*?)\n```/); // looks for ```json ...content... ```
    if (match) {
        const jsonContent = match[1]; // Extracted JSON string
        if (options.verboseLogging) console.log("Extracted JSON:", jsonContent);

        try {
            const parsedJson = JSON.parse(jsonContent);
            if (options.verboseLogging)
                console.log("Parsed JSON object:", parsedJson);
            return parsedJson;
        } catch (error) {
            console.error("Error parsing JSON:", error, jsonContent);
            return [];
        }
    } else {
        console.log("No JSON found.");
        return [];
    }
}

function isValidTranslateItem(item: any): item is TranslateItem {
    return (
        typeof item.key === "string" &&
        typeof item.originalText === "string" &&
        typeof item.translatedText === "string" &&
        typeof item.context === "string"
    );
}

function isValidCheckTranslateItem(item: any): item is CheckTranslateItem {
    return (
        typeof item.key === "string" &&
        typeof item.originalText === "string" &&
        typeof item.translatedText === "string" &&
        typeof item.context === "string" &&
        (typeof item.invalid === "boolean" || item.invalid === null) &&
        typeof item.invalidReason === "string"
    );
}

function isValidRetranslateItem(item: any): item is RetranslateItem {
    return (
        typeof item.key === "string" &&
        typeof item.originalText === "string" &&
        typeof item.newTranslatedText === "string" &&
        typeof item.context === "string" &&
        typeof item.invalidTranslatedText === "string" &&
        typeof item.invalidReason === "string"
    );
}

function createValidateTranslateItemArray(
    untranslatedItems: TranslateItem[],
    translatedItems: TranslateItem[],
): CheckTranslateItem[] {
    const verificationOutput: CheckTranslateItem[] = [];

    for (const untranslatedItem of untranslatedItems) {
        const translatedItem = translatedItems.find(
            (checkTranslatedItem) =>
                untranslatedItem.key === checkTranslatedItem.key,
        );

        if (translatedItem) {
            verificationOutput.push({
                context: untranslatedItem.context,
                invalid: null,
                invalidReason: "",
                key: untranslatedItem.key,
                originalText: untranslatedItem.originalText,
                translatedText: translatedItem.translatedText,
            } as CheckTranslateItem);
        }
    }

    return verificationOutput;
}

function createValidatedTranslateItemArray(
    checkTranslateItems: CheckTranslateItem[],
    verifiedTranslateItems: CheckTranslateItem[],
): CheckTranslateItem[] {
    const verificationOutput: CheckTranslateItem[] = [];

    for (const checkTranslateItem of checkTranslateItems) {
        const verifiedTranslateItem = verifiedTranslateItems.find(
            (checkVerifiedTranslateItem) =>
                checkTranslateItem.key === checkVerifiedTranslateItem.key,
        );

        if (verifiedTranslateItem) {
            verificationOutput.push({
                context: checkTranslateItem.context,
                invalid: verifiedTranslateItem.invalid,
                invalidReason: verifiedTranslateItem.invalidReason,
                key: checkTranslateItem.key,
                originalText: checkTranslateItem.originalText,
                translatedText: checkTranslateItem.translatedText,
            } as CheckTranslateItem);
        }
    }

    return verificationOutput;
}

function verifyGenerationAndRetry(
    options: GenerateTranslationOptions,
    generateState: GenerateState,
): Promise<TranslateItemResult[]> {
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

async function verifyTranslationAndFix(
    verificationInput: CheckTranslateItem[],
    options: GenerateTranslationOptions,
    input: CheckTranslateItem[],
) {
    const translationVerificationResponse = await verifyTranslation(
        options.chats.verifyTranslationChat,
        options.inputLanguage,
        options.outputLanguage,
        input,
        options.overridePrompt,
    );

    const parsedOutput = parseOutputToJson(
        translationVerificationResponse,
        options,
    ) as CheckTranslateItem[];

    const validatedTranslateItemArray = createValidatedTranslateItemArray(
        verificationInput,
        parsedOutput.filter(isValidCheckTranslateItem),
    );

    const invalidTranslations = validatedTranslateItemArray.filter(
        (validatedTranslateItem) => validatedTranslateItem.invalid,
    );

    if (invalidTranslations) {
        console.log(invalidTranslations);
        const retranslateInput = invalidTranslations.map(
            (invalidTranslation) =>
                ({
                    context: invalidTranslation.context,
                    invalidReason: invalidTranslation.invalidReason,
                    invalidTranslatedText: invalidTranslation.translatedText,
                    key: invalidTranslation.key,
                    newTranslatedText: "",
                    originalText: invalidTranslation.originalText,
                }) as RetranslateItem,
        );

        const fixedTranslations = await fixTranslation(
            options.chats.verifyTranslationChat,
            options.inputLanguage,
            options.outputLanguage,
            retranslateInput,
        );

        console.log(fixedTranslations);
    } else {
        console.log("nothing to fix");
    }
}

async function generate(
    options: GenerateTranslationOptions,
    generationPromptText: string,
    generateState: GenerateState,
): Promise<TranslateItemResult[]> {
    const text =
        await options.chats.generateTranslationChat.sendMessage(
            generationPromptText,
        );

    if (!text) {
        return verifyGenerationAndRetry(options, generateState);
    } else {
        generateState.generationRetries = 0;
    }

    const parsedOutput = parseOutputToJson(text, options);

    const verificationInput = createValidateTranslateItemArray(
        options.translateItems,
        parsedOutput.filter(isValidTranslateItem),
    );

    if (!options.skipTranslationVerification) {
        await verifyTranslationAndFix(
            verificationInput,
            options,
            verificationInput,
        );
    }

    // let stylingVerificationResponse = "";
    // if (!options.skipStylingVerification) {
    //     stylingVerificationResponse = await verifyStyling(
    //         chats.verifyStylingChat,
    //         inputLanguage,
    //         outputLanguage,
    //         input,
    //         text,
    //         options.overridePrompt,
    //     );
    // }

    // if (isNAK(stylingVerificationResponse)) {
    //     chats.generateTranslationChat.invalidStyling();
    //     return Promise.reject(new Error(`Invalid styling. text = ${text}`));
    // }

    return [];
}
