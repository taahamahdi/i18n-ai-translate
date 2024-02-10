import { delay, retryJob } from "./utils";
import { verifyStyling, verifyTranslation } from "./verify";
import type { GenerativeModel, StartChatParams } from "@google/generative-ai";
import type Chats from "./interfaces/chats";

const generationPrompt = (
    inputLanguage: string,
    outputLanguage: string,
    input: string,
): string =>
    `You are a professional translator.

Translate each line from ${inputLanguage} to ${outputLanguage}.

Return translations in the same text formatting.

Maintain case sensitivity and whitespacing.

Output only the translations.

All lines should start and end with a quotation mark.

\`\`\`
${input}
\`\`\`
`;

const failedTranslationPrompt = (
    inputLanguage: string,
    outputLanguage: string,
    input: string,
): string =>
    `You are a professional translator. The following translation from ${inputLanguage} to ${outputLanguage} failed. Attempt to translate it to ${outputLanguage} by considering it as a concatenation of ${inputLanguage} words, or re-interpreting it such that it makes sense in ${outputLanguage}. Return only the translation with no additional formatting, apart from returning it in quotes. Maintain case sensitivity and whitespacing.

\`\`\`
${input}
\`\`\`
`;

/**
 * Complete the initial translation of the input text.
 * @param model - Gemini model
 * @param chats - State of chats
 * @param successfulHistory - Messages that have been successfully translated in the past; used for rolling back
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
    model: GenerativeModel,
    chats: Chats,
    successfulHistory: StartChatParams,
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
                let lastGeminiCall = Date.now();
                let generatedContent: any;
                let text = "";
                try {
                    generatedContent =
                        await chats.generateTranslationChat.sendMessage(
                            generationPromptText,
                        );

                    text = generatedContent.response.text();
                } catch (err) {
                    generationRetries++;
                    console.error(
                        `Gemini exception encountered. err = ${JSON.stringify(generatedContent?.response, null, 4)}`,
                    );

                    if (generationRetries > 10) {
                        successfulHistory.history = [];
                        chats.generateTranslationChat = model.startChat();
                        return Promise.reject(
                            new Error(
                                `Failed to generate content due to exception. Resetting history. err = ${err}`,
                            ),
                        );
                    }

                    console.error(`Erroring text = ${input}`);
                    chats.generateTranslationChat =
                        model.startChat(successfulHistory);
                    return Promise.reject(
                        new Error(
                            `Failed to generate content due to exception. err = ${err}`,
                        ),
                    );
                }

                if (text === "") {
                    return Promise.reject(
                        new Error(
                            "Failed to generate content due to empty response",
                        ),
                    );
                }

                generationRetries = 0;

                // Response length matches
                const splitText = text.split("\n");
                if (splitText.length !== keys.length) {
                    chats.generateTranslationChat =
                        model.startChat(successfulHistory);
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
                                chats.generateTranslationChat =
                                    model.startChat(successfulHistory);
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
                    while (line.startsWith("\"\"") && line.endsWith("\"\"")) {
                        line = line.slice(1, -1);
                    }

                    splitText[i] = line;
                }

                text = splitText.join("\n");

                // Per-line translation verification
                for (let i = 0; i < splitText.length; i++) {
                    let line = splitText[i];
                    if (!line.startsWith("\"") || !line.endsWith("\"")) {
                        chats.generateTranslationChat =
                            model.startChat(successfulHistory);
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

                        // eslint-disable-next-line no-await-in-loop
                        await delay(1000 - (Date.now() - lastGeminiCall));
                        lastGeminiCall = Date.now();
                        const retryTranslationPromptText =
                            failedTranslationPrompt(
                                inputLanguage,
                                outputLanguage,
                                line,
                            );

                        let fixedText = "";
                        try {
                            generatedContent =
                                // eslint-disable-next-line no-await-in-loop
                                await chats.generateTranslationChat.sendMessage(
                                    retryTranslationPromptText,
                                );
                            fixedText = generatedContent.response.text();
                        } catch (err) {
                            console.error(
                                JSON.stringify(
                                    generatedContent?.response,
                                    null,
                                    4,
                                ),
                            );

                            chats.generateTranslationChat =
                                model.startChat(successfulHistory);
                            return Promise.reject(
                                new Error(
                                    `Failed to generate content due to exception. err = ${err}`,
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
                                chats.generateTranslationChat =
                                    model.startChat(successfulHistory);
                                return Promise.reject(
                                    new Error(
                                        `Missing templated string: ${inputLineToTemplatedString[i][j]}`,
                                    ),
                                );
                            }
                        }

                        // TODO: Move to helper
                        if (!line.startsWith("\"") || !line.endsWith("\"")) {
                            chats.generateTranslationChat =
                                model.startChat(successfulHistory);
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
                            chats.generateTranslationChat =
                                model.startChat(successfulHistory);
                            return Promise.reject(
                                new Error(`No translation: ${line}`),
                            );
                        }
                    }
                }

                await delay(1000 - (Date.now() - lastGeminiCall));
                lastGeminiCall = Date.now();
                const translationVerification = await verifyTranslation(
                    chats.verifyTranslationChat,
                    inputLanguage,
                    outputLanguage,
                    input,
                    text,
                );

                if (translationVerification === "NAK") {
                    chats.generateTranslationChat =
                        model.startChat(successfulHistory);
                    return Promise.reject(
                        new Error(`Invalid translation. text = ${text}`),
                    );
                }

                await delay(1000 - (Date.now() - lastGeminiCall));
                lastGeminiCall = Date.now();
                const stylingVerification = await verifyStyling(
                    chats.verifyStylingChat,
                    inputLanguage,
                    outputLanguage,
                    input,
                    text,
                );

                if (stylingVerification === "NAK") {
                    chats.generateTranslationChat =
                        model.startChat(successfulHistory);
                    return Promise.reject(
                        new Error(`Invalid styling. text = ${text}`),
                    );
                }

                successfulHistory.history!.push(
                    { role: "user", parts: generationPromptText },
                    { role: "model", parts: text },
                );

                return text;
            },
            [],
            50,
            true,
            1000,
            false,
        );
    } catch (e) {
        console.error(`Failed to translate: ${e}`);
    }

    return translated;
}
