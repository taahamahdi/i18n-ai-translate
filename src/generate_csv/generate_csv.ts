import { failedTranslationPrompt, generationPrompt } from "./prompts_csv";
import { isNAK } from "./utils_csv";
import { retryJob } from "../utils";
import { verifyStyling, verifyTranslation } from "./verify_csv";
import type { GenerateState } from "src/types";
import type GenerateTranslationOptionsCsv from "../interfaces/generate_translation_options_csv";

/**
 * Complete the initial translation of the input text.
 * @param options - The options to generate the translation
 */
export default async function generateTranslation(
    options: GenerateTranslationOptionsCsv,
): Promise<string> {
    const {
        input,
        inputLanguage,
        outputLanguage,
        templatedStringPrefix,
        templatedStringSuffix,
    } = options;

    const generationPromptText = generationPrompt(
        inputLanguage,
        outputLanguage,
        input,
        options.overridePrompt,
    );

    const templatedStringRegex = new RegExp(
        `${templatedStringPrefix}[^{}]+${templatedStringSuffix}`,
        "g",
    );

    const splitInput = input.split("\n");

    const generateState: GenerateState = {
        fixedTranslationMappings: {},
        generationRetries: 0,
        inputLineToTemplatedString: {},
        splitInput,
        translationToRetryAttempts: {},
    };

    for (let i = 0; i < splitInput.length; i++) {
        const match = splitInput[i].match(templatedStringRegex);
        if (match) {
            generateState.inputLineToTemplatedString[i] = match;
        }
    }

    let translated = "";
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

async function generate(
    options: GenerateTranslationOptionsCsv,
    generationPromptText: string,
    generateState: GenerateState,
): Promise<string> {
    const {
        chats,
        inputLanguage,
        outputLanguage,
        input,
        keys,
        verboseLogging,
        ensureChangedTranslation,
    } = options;

    const {
        inputLineToTemplatedString,
        translationToRetryAttempts,
        fixedTranslationMappings,
        splitInput, // Fine to destructure here -- we never modify the original
    } = generateState;

    let text =
        await chats.generateTranslationChat.sendMessage(generationPromptText);

    if (!text) {
        generateState.generationRetries++;
        if (generateState.generationRetries > 10) {
            chats.generateTranslationChat.resetChatHistory();
            return Promise.reject(
                new Error(
                    "Failed to generate content due to exception. Resetting history.",
                ),
            );
        }

        console.error(`Erroring text = ${input}`);
        chats.generateTranslationChat.rollbackLastMessage();
        return Promise.reject(
            new Error("Failed to generate content due to exception."),
        );
    }

    generateState.generationRetries = 0;

    if (text.startsWith("```\n") && text.endsWith("\n```")) {
        if (verboseLogging) {
            console.log("Response started and ended with triple backticks");
        }

        text = text.slice(4, -4);
    }

    // Response length matches
    const splitText = text.split("\n");
    if (splitText.length !== keys.length) {
        chats.generateTranslationChat.rollbackLastMessage();
        return Promise.reject(
            new Error(`Invalid number of lines. text = ${text}`),
        );
    }

    // Templated strings match
    for (const i in inputLineToTemplatedString) {
        if (
            Object.prototype.hasOwnProperty.call(inputLineToTemplatedString, i)
        ) {
            for (const templatedString of inputLineToTemplatedString[i]) {
                if (!splitText[i].includes(templatedString)) {
                    chats.generateTranslationChat.rollbackLastMessage();
                    return Promise.reject(
                        new Error(
                            `Missing templated string: ${templatedString}`,
                        ),
                    );
                }
            }
        }
    }

    // Trim extra quotes if they exist
    for (let i = 0; i < splitText.length; i++) {
        let line = splitText[i];
        while (line.startsWith('""')) {
            line = line.slice(1);
        }

        while (line.endsWith('""')) {
            line = line.slice(0, -1);
        }

        splitText[i] = line;
    }

    text = splitText.join("\n");

    // Per-line translation verification
    for (let i = 0; i < splitText.length; i++) {
        let line = splitText[i];
        if (
            !line.startsWith('"') ||
            !line.endsWith('"') ||
            line.endsWith('\\"')
        ) {
            chats.generateTranslationChat.rollbackLastMessage();
            return Promise.reject(new Error(`Invalid line: ${line}`));
        } else if (
            ensureChangedTranslation &&
            line === splitInput[i] &&
            line.length > 4
        ) {
            if (translationToRetryAttempts[line] === undefined) {
                translationToRetryAttempts[line] = 0;
            } else if (fixedTranslationMappings[line]) {
                splitText[i] = fixedTranslationMappings[line];
                continue;
            }

            const retryTranslationPromptText = failedTranslationPrompt(
                inputLanguage,
                outputLanguage,
                line,
            );

            const fixedText =
                // eslint-disable-next-line no-await-in-loop
                await chats.generateTranslationChat.sendMessage(
                    retryTranslationPromptText,
                );

            if (fixedText === "") {
                chats.generateTranslationChat.rollbackLastMessage();
                return Promise.reject(
                    new Error("Failed to generate content due to exception."),
                );
            }

            const oldText = line;
            splitText[i] = fixedText;
            line = fixedText;

            // TODO: Move to helper
            for (const j in inputLineToTemplatedString[i]) {
                if (!splitText[i].includes(inputLineToTemplatedString[i][j])) {
                    chats.generateTranslationChat.rollbackLastMessage();
                    return Promise.reject(
                        new Error(
                            `Missing templated string: ${inputLineToTemplatedString[i][j]}`,
                        ),
                    );
                }
            }

            // TODO: Move to helper
            if (!line.startsWith('"') || !line.endsWith('"')) {
                chats.generateTranslationChat.rollbackLastMessage();
                return Promise.reject(new Error(`Invalid line: ${line}`));
            }

            while (line.startsWith('""') && line.endsWith('""')) {
                line = line.slice(1, -1);
            }

            if (line !== splitInput[i]) {
                if (verboseLogging) {
                    console.log(
                        `Successfully translated: ${oldText} => ${line}`,
                    );
                }

                text = splitText.join("\n");
                fixedTranslationMappings[oldText] = line;
                continue;
            }

            translationToRetryAttempts[line]++;
            if (translationToRetryAttempts[line] < 3) {
                chats.generateTranslationChat.rollbackLastMessage();
                return Promise.reject(new Error(`No translation: ${line}`));
            }
        }
    }

    let translationVerificationResponse = "";
    if (!options.skipTranslationVerification) {
        translationVerificationResponse = await verifyTranslation(
            chats.verifyTranslationChat,
            inputLanguage,
            outputLanguage,
            input,
            text,
            options.overridePrompt,
        );
    }

    if (isNAK(translationVerificationResponse)) {
        chats.generateTranslationChat.invalidTranslation();
        return Promise.reject(new Error(`Invalid translation. text = ${text}`));
    }

    let stylingVerificationResponse = "";
    if (!options.skipStylingVerification) {
        stylingVerificationResponse = await verifyStyling(
            chats.verifyStylingChat,
            inputLanguage,
            outputLanguage,
            input,
            text,
            options.overridePrompt,
        );
    }

    if (isNAK(stylingVerificationResponse)) {
        chats.generateTranslationChat.invalidStyling();
        return Promise.reject(new Error(`Invalid styling. text = ${text}`));
    }

    return text;
}
