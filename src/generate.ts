import { GenerativeModel, StartChatParams } from "@google/generative-ai";
import { retryJob } from "./utils";
import { verifyStyling, verifyTranslation } from "./verify";
import Chats from "./interfaces/chats";

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

export async function generateTranslation(
    model: GenerativeModel,
    chats: Chats,
    successfulHistory: StartChatParams,
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    keys: Array<string>,
): Promise<string> {
    const generationPromptText = generationPrompt(
        inputLanguage,
        outputLanguage,
        input,
    );
    const templatedStringRegex = /{{[^{}]+}}/g;
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

    let translated = "";
    try {
        translated = await retryJob(
            async (): Promise<string> => {
                let generatedContent: any;
                let text = "";
                try {
                    generatedContent =
                        await chats.generateTranslationChat.sendMessage(
                            generationPromptText,
                        );
                    text = generatedContent.response.text();
                } catch (err) {
                    console.error(
                        `Gemini exception encountered. err = ${JSON.stringify(generatedContent?.response, null, 4)}`,
                    );

                    console.error(`Offending text = ${text}`);
                    chats.generateTranslationChat =
                        model.startChat(successfulHistory);
                    return Promise.reject(
                        `Failed to generate content due to exception. err = ${err}`,
                    );
                }

                if (text === "") {
                    return Promise.reject(
                        "Failed to generate content due to empty response",
                    );
                }

                // Response length matches
                const splitText = text.split("\n");
                if (splitText.length !== keys.length) {
                    chats.generateTranslationChat =
                        model.startChat(successfulHistory);
                    return Promise.reject(
                        `Invalid number of lines. text = ${text}`,
                    );
                }

                // Templated strings match
                for (const i in inputLineToTemplatedString) {
                    for (const templatedString of inputLineToTemplatedString[
                        i
                    ]) {
                        if (!splitText[i].includes(templatedString)) {
                            chats.generateTranslationChat =
                                model.startChat(successfulHistory);
                            return Promise.reject(
                                `Missing templated string: ${templatedString}`,
                            );
                        }
                    }
                }

                // Trim extra quotes if they exist
                for (let i = 0; i < splitText.length; i++) {
                    let line = splitText[i];
                    while (line.startsWith('""') && line.endsWith('""')) {
                        line = line.slice(1, -1);
                    }

                    splitText[i] = line;
                }
                text = splitText.join("\n");

                // Per-line translation verification
                for (let i = 0; i < splitText.length; i++) {
                    let line = splitText[i];
                    if (!line.startsWith('"') || !line.endsWith('"')) {
                        chats.generateTranslationChat =
                            model.startChat(successfulHistory);
                        return Promise.reject(`Invalid line: ${line}`);
                    } else if (line === splitInput[i] && line.length > 4) {
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
                        let fixedText = "";
                        try {
                            generatedContent =
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
                                `Failed to generate content due to exception. err = ${err}`,
                            );
                        }

                        const oldText = line;
                        splitText[i] = fixedText;
                        line = fixedText;

                        // Move to helper
                        for (const j in inputLineToTemplatedString[i]) {
                            if (
                                !splitText[i].includes(
                                    inputLineToTemplatedString[i][j],
                                )
                            ) {
                                chats.generateTranslationChat =
                                    model.startChat(successfulHistory);
                                return Promise.reject(
                                    `Missing templated string: ${inputLineToTemplatedString[i][j]}`,
                                );
                            }
                        }

                        // Move to helper
                        if (!line.startsWith('"') || !line.endsWith('"')) {
                            chats.generateTranslationChat =
                                model.startChat(successfulHistory);
                            return Promise.reject(`Invalid line: ${line}`);
                        }

                        if (line !== splitInput[i]) {
                            console.log(
                                `Successfully translated: ${oldText} => ${line}`,
                            );
                            text = splitText.join("\n");
                            fixedTranslationMappings[oldText] = line;
                            continue;
                        }

                        translationToRetryAttempts[line]++;
                        if (translationToRetryAttempts[line] < 3) {
                            chats.generateTranslationChat =
                                model.startChat(successfulHistory);
                            return Promise.reject(`No translation: ${line}`);
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
                    chats.generateTranslationChat =
                        model.startChat(successfulHistory);
                    return Promise.reject(
                        `Invalid translation. text = ${text}`,
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
                    chats.generateTranslationChat =
                        model.startChat(successfulHistory);
                    return Promise.reject(`Invalid styling. text = ${text}`);
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
            0,
            false,
        );
    } catch (e) {
        console.error(`Failed to translate: ${e}`);
    }

    return translated;
}
