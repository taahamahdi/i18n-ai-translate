import { RETRY_ATTEMPTS } from "../constants";
import { failedTranslationPrompt, generationPrompt } from "./prompts";
import {
    getTemplatedStringRegex,
    isNAK,
    printError,
    printInfo,
    printProgress,
    retryJob,
} from "../utils";
import { verifyStyling, verifyTranslation } from "./verify";
import type { GenerateStateCSV, TranslationStatsItem } from "../types";
import type Chats from "../interfaces/chats";
import type GenerateTranslationOptionsCSV from "../interfaces/generate_translation_options_csv";
import type TranslateOptions from "../interfaces/translate_options";

/**
 * Complete the initial translation of the input text.
 * @param flatInput - The flatinput object containing the json to translate
 * @param options - The options to generate the translation
 * @param chats - The options to generate the translation
 * @param translationStats - The translation statistics
 */
export default async function translateCSV(
    flatInput: { [key: string]: string },
    options: TranslateOptions,
    chats: Chats,
    translationStats: TranslationStatsItem,
): Promise<{ [key: string]: string }> {
    const output: { [key: string]: string } = {};

    const allKeys = Object.keys(flatInput);

    const batchSize = Number(options.batchSize);

    translationStats.batchStartTime = Date.now();

    for (let i = 0; i < Object.keys(flatInput).length; i += batchSize) {
        const keys = allKeys.slice(i, i + batchSize);
        const input = keys.map((x) => `"${flatInput[x]}"`).join("\n");

        // eslint-disable-next-line no-await-in-loop
        const generatedTranslation = await generateTranslation({
            chats,
            ensureChangedTranslation:
                options.ensureChangedTranslation as boolean,
            input,
            inputLanguage: `[${options.inputLanguage}]`,
            keys,
            outputLanguage: `[${options.outputLanguage}]`,
            overridePrompt: options.overridePrompt,
            skipStylingVerification: options.skipStylingVerification as boolean,
            skipTranslationVerification:
                options.skipTranslationVerification as boolean,
            templatedStringPrefix: options.templatedStringPrefix as string,
            templatedStringSuffix: options.templatedStringSuffix as string,
            verboseLogging: options.verbose as boolean,
        });

        if (generatedTranslation === "") {
            printError(
                `Failed to generate translation for ${options.outputLanguage}`,
            );
            break;
        }

        for (let j = 0; j < keys.length; j++) {
            output[keys[j]] = generatedTranslation.split("\n")[j].slice(1, -1);

            if (options.verbose)
                printInfo(
                    `${keys[j].replaceAll("*", ".")}:\n${flatInput[keys[j]]}\n=>\n${output[keys[j]]}\n`,
                );
        }

        if (options.verbose && i > 0) {
            printProgress(
                "Completed",
                translationStats.batchStartTime,
                Object.keys(flatInput).length,
                i,
            );
        }
    }

    return output;
}

async function generateTranslation(
    options: GenerateTranslationOptionsCSV,
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

    const templatedStringRegex = getTemplatedStringRegex(
        templatedStringPrefix,
        templatedStringSuffix,
    );

    const splitInput = input.split("\n");

    const generateState: GenerateStateCSV = {
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
            RETRY_ATTEMPTS,
            true,
            0,
            false,
        );
    } catch (e) {
        printError(`Failed to translate: ${e}`);
    }

    return translated;
}

async function generate(
    options: GenerateTranslationOptionsCSV,
    generationPromptText: string,
    generateState: GenerateStateCSV,
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

        printError(`Erroring text = ${input}`);
        chats.generateTranslationChat.rollbackLastMessage();
        return Promise.reject(
            new Error("Failed to generate content due to exception."),
        );
    }

    generateState.generationRetries = 0;

    if (text.startsWith("```\n") && text.endsWith("\n```")) {
        if (verboseLogging) {
            printInfo("\nResponse started and ended with triple backticks");
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
                    printInfo(`Successfully translated: ${oldText} => ${line}`);
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
