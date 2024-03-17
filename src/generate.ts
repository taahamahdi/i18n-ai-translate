import { retryJob } from "./utils";
import { verifyStyling, verifyTranslation } from "./verify";
import type Chats from "./interfaces/chats";
import { failedTranslationPrompt, generationPrompt } from "./prompts";

/**
 * Complete the initial translation of the input text.
 * @param chats - State of chats
 * @param inputLanguage - Language of the input text
 * @param outputLanguage - Language to translate the input text to
 * @param input - Text to translate
 * @param keys - The keys of the input text
 * @param templatedStringPrefix - Prefix of the templated string
 * @param templatedStringSuffix - Suffix of the templated string
 * @param verboseLogging - Whether to log verbose output
 * @param ensureChangedTranslation - Whether to ensure that each key has changed
 */
export default async function generateTranslation(
    chats: Chats,
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    keys: Array<string>,
    templatedStringPrefix: string,
    templatedStringSuffix: string,
    verboseLogging: boolean,
    ensureChangedTranslation: boolean,
): Promise<string> {
    const generationPromptText = generationPrompt(
        inputLanguage,
        outputLanguage,
        input,
    );

    const templatedStringRegex = `/${templatedStringPrefix}[^{}]+${templatedStringSuffix}/g`;
    const inputLineToTemplatedString: { [index: number]: Array<string> } = {};
    const splitInput = input.split("\n");
    for (let i = 0; i < splitInput.length; i++) {
        const match = splitInput[i].match(templatedStringRegex);
        if (match) {
            inputLineToTemplatedString[i] = match;
        }
    }

    const fixedTranslationMappings: { [input: string]: string } = {};
    const translationToRetryAttempts: { [translation: string]: number } = {};

    let generationRetries = 0;
    let translated = "";
    try {
        translated = await retryJob(
            async (): Promise<string> => {
                let text =
                    await chats.generateTranslationChat.sendMessage(
                        generationPromptText,
                    );

                if (!text) {
                    generationRetries++;
                    if (generationRetries > 10) {
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
                        new Error(
                            "Failed to generate content due to exception.",
                        ),
                    );
                }

                generationRetries = 0;

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
                        Object.prototype.hasOwnProperty.call(
                            inputLineToTemplatedString,
                            i,
                        )
                    ) {
                        for (const templatedString of inputLineToTemplatedString[
                            i
                        ]) {
                            if (!splitText[i].includes(templatedString)) {
                                if (verboseLogging) {
                                    console.log("doesn't include", templatedString);
                                }

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
                    while (line.startsWith("\"\"")) {
                        line = line.slice(1);
                    }

                    while (line.endsWith("\"\"")) {
                        line = line.slice(0, -1);
                    }

                    splitText[i] = line;
                }

                text = splitText.join("\n");

                // Per-line translation verification
                for (let i = 0; i < splitText.length; i++) {
                    let line = splitText[i];
                    if (
                        !line.startsWith("\"") ||
                        !line.endsWith("\"") ||
                        line.endsWith("\\\"")
                    ) {
                        chats.generateTranslationChat.rollbackLastMessage();
                        return Promise.reject(
                            new Error(`Invalid line: ${line}`),
                        );
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

                        const retryTranslationPromptText =
                            failedTranslationPrompt(
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
                                new Error(
                                    "Failed to generate content due to exception.",
                                ),
                            );
                        }

                        const oldText = line;
                        splitText[i] = fixedText;
                        line = fixedText;

                        // TODO: Move to helper
                        for (const j in inputLineToTemplatedString[i]) {
                            if (
                                !splitText[i].includes(
                                    inputLineToTemplatedString[i][j],
                                )
                            ) {
                                chats.generateTranslationChat.rollbackLastMessage();
                                return Promise.reject(
                                    new Error(
                                        `Missing templated string: ${inputLineToTemplatedString[i][j]}`,
                                    ),
                                );
                            }
                        }

                        // TODO: Move to helper
                        if (!line.startsWith("\"") || !line.endsWith("\"")) {
                            chats.generateTranslationChat.rollbackLastMessage();
                            return Promise.reject(
                                new Error(`Invalid line: ${line}`),
                            );
                        }

                        while (line.startsWith("\"\"") && line.endsWith("\"\"")) {
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
                            return Promise.reject(
                                new Error(`No translation: ${line}`),
                            );
                        }
                    }
                }

                const translationVerification = await verifyTranslation(
                    chats.verifyTranslationChat,
                    inputLanguage,
                    outputLanguage,
                    input,
                    text,
                );

                if (translationVerification === "NAK") {
                    chats.generateTranslationChat.invalidTranslation();
                    return Promise.reject(
                        new Error(`Invalid translation. text = ${text}`),
                    );
                }

                const stylingVerification = await verifyStyling(
                    chats.verifyStylingChat,
                    inputLanguage,
                    outputLanguage,
                    input,
                    text,
                );

                if (stylingVerification === "NAK") {
                    chats.generateTranslationChat.invalidStyling();
                    return Promise.reject(
                        new Error(`Invalid styling. text = ${text}`),
                    );
                }

                return text;
            },
            [],
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
