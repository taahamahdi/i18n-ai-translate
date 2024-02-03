import { GoogleGenerativeAI, StartChatParams } from "@google/generative-ai";
import { program } from "commander";
import { config } from "dotenv";
import { flatten, unflatten } from "flat";
import { by639_1 as languageCodes } from "iso-language-codes";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, ".env") });

program
    .requiredOption("-i, --input <input>", "Source i18n file")
    .requiredOption("-o, --output <output>", "Output i18n file");

program.parse();
const options = program.opts();

const genAI = new GoogleGenerativeAI(process.env.API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const generateTranslation = async (
    successfulHistory: StartChatParams,
    generateTranslationGeminiChat: any,
    verifyTranslationGeminiChat: any,
    verifyStylingGeminiChat: any,
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    keys: Array<string>,
): Promise<string> => {
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

    const translationToRetryAttempts: { [translation: string]: number } = {};

    let translated = "";
    try {
        translated = await retryJob(
            async (): Promise<string> => {
                let generatedContent: any;
                let text = "";
                try {
                    generatedContent =
                        await generateTranslationGeminiChat.sendMessage(
                            generationPromptText,
                        );
                    text = generatedContent.response.text();
                } catch (err) {
                    console.error(
                        JSON.stringify(generatedContent?.response, null, 4),
                    );
                    generateTranslationGeminiChat =
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

                const splitText = text.split("\n");
                if (splitText.length !== keys.length) {
                    generateTranslationGeminiChat =
                        model.startChat(successfulHistory);
                    return Promise.reject(
                        `Invalid number of lines. text = ${text}`,
                    );
                }

                for (const i in inputLineToTemplatedString) {
                    for (const templatedString of inputLineToTemplatedString[
                        i
                    ]) {
                        if (!splitText[i].includes(templatedString)) {
                            generateTranslationGeminiChat =
                                model.startChat(successfulHistory);
                            return Promise.reject(
                                `Missing templated string: ${templatedString}`,
                            );
                        }
                    }
                }

                for (let i = 0; i < splitText.length; i++) {
                    let line = splitText[i];
                    if (!line.startsWith('"') || !line.endsWith('"')) {
                        generateTranslationGeminiChat =
                            model.startChat(successfulHistory);
                        return Promise.reject(`Invalid line: ${line}`);
                    } else if (line === splitInput[i] && line.length > 2) {
                        if (translationToRetryAttempts[line] === undefined) {
                            translationToRetryAttempts[line] = 0;
                        }

                        const retryTranslationPromptText =
                            failedTranslationPrompt(
                                inputLanguage,
                                outputLanguage,
                                line,
                            );
                        try {
                            generatedContent =
                                await generateTranslationGeminiChat.sendMessage(
                                    retryTranslationPromptText,
                                );
                            text = generatedContent.response.text();
                        } catch (err) {
                            console.error(
                                JSON.stringify(
                                    generatedContent?.response,
                                    null,
                                    4,
                                ),
                            );
                            generateTranslationGeminiChat =
                                model.startChat(successfulHistory);
                            return Promise.reject(
                                `Failed to generate content due to exception. err = ${err}`,
                            );
                        }

                        const oldText = line;
                        splitText[i] = text;
                        line = text;

                        // Move to helper
                        // for (const templatedString in inputLineToTemplatedString[i]) {
                        //     if (!splitText[i].includes(templatedString)) {
                        //         generateTranslationGeminiChat = model.startChat(successfulHistory);
                        //         return Promise.reject(`Missing templated string: ${templatedString}`);
                        //     }
                        // }

                        // Move to helper
                        if (!line.startsWith('"') || !line.endsWith('"')) {
                            generateTranslationGeminiChat =
                                model.startChat(successfulHistory);
                            return Promise.reject(`Invalid line: ${line}`);
                        }

                        if (line !== splitInput[i]) {
                            console.log(
                                `Successfully translated: ${oldText} => ${line}`,
                            );
                            continue;
                        }

                        translationToRetryAttempts[line]++;
                        if (translationToRetryAttempts[line] < 3) {
                            generateTranslationGeminiChat =
                                model.startChat(successfulHistory);
                            return Promise.reject(`No translation: ${line}`);
                        }
                    }
                }

                const translationVerificationPromptText =
                    translationVerificationPrompt(
                        inputLanguage,
                        outputLanguage,
                        input,
                        text,
                    );
                const translationVerification = await verify(
                    verifyTranslationGeminiChat,
                    translationVerificationPromptText,
                );
                if (translationVerification === "NAK") {
                    generateTranslationGeminiChat =
                        model.startChat(successfulHistory);
                    return Promise.reject(
                        `Invalid translation. text = ${text}`,
                    );
                }

                const stylingVerificationPromptText = stylingVerificationPrompt(
                    inputLanguage,
                    outputLanguage,
                    input,
                    text,
                );
                const stylingVerification = await verify(
                    verifyStylingGeminiChat,
                    stylingVerificationPromptText,
                );
                if (stylingVerification === "NAK") {
                    generateTranslationGeminiChat =
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
            500,
            false,
        );
    } catch (e) {
        console.error(`Failed to translate: ${e}`);
    }

    return translated;
};

const generationPrompt = (
    inputLanguage: string,
    outputLanguage: string,
    input: string,
): string =>
    `You are a professional translator. Translate each line from ${inputLanguage} to ${outputLanguage}. Return translations in the same text formatting (maintaining exact case sensitivity and exact whitespacing). Output only the translations.

\`\`\`
${input}
\`\`\`
`;

const failedTranslationPrompt = (
    inputLanguage: string,
    outputLanguage: string,
    input: string,
): string =>
    `You are a professional translator. The following translation from ${inputLanguage} to ${outputLanguage} failed. Attempt to translate it to ${outputLanguage} by considering it as a concatenation of ${inputLanguage} words, or re-interpreting it such that it makes sense in ${outputLanguage}. If it is already in an optimal format, just return the input. Return only the translation with no additioanl formatting.

\`\`\`
${input}
\`\`\`
`;

const verify = async (
    geminiChat: any,
    verificationPromptText: string,
): Promise<string> => {
    let verification = "";
    try {
        verification = await retryJob(
            async (): Promise<string> => {
                const generatedContent = await geminiChat.sendMessage(
                    verificationPromptText,
                );
                const text = generatedContent.response.text();
                if (text === "") {
                    return Promise.reject("Failed to generate content");
                }

                if (text !== "ACK" && text !== "NAK") {
                    return Promise.reject("Invalid response");
                }

                return text;
            },
            [],
            5,
            true,
            500,
            false,
        );
    } catch (e) {
        console.error(`Failed to verify: ${e}`);
    }

    return verification;
};

const translationVerificationPrompt = (
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    output: string,
): string => {
    const splitInput = input.split("\n");
    const splitOutput = output.split("\n");
    const mergedCsv = splitInput
        .map((x, i) => `${x},${splitOutput[i]}`)
        .join("\n");
    return `
You are a translation verifier. Given a translation from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations are poorly translated. Otherwise, reply with ACK. Only reply with ACK/NAK.

**Be as nitpicky as possible**.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCsv}
\`\`\`
`;
};

const stylingVerificationPrompt = (
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    output: string,
): string => {
    const splitInput = input.split("\n");
    const splitOutput = output.split("\n");
    const mergedCsv = splitInput
        .map((x, i) => `${x},${splitOutput[i]}`)
        .join("\n");
    return `
You are a text styling verifier. Given a translation from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations do not match the exact styling of the original (capitalization, whitespace, etc.). Otherwise, reply with ACK. Only reply with ACK/NAK.

**Be as nitpicky as possible.**

For example, "Error Removing Duration",Fout bij het verwijderen van duur" results in NAK because of inconsistent capitalization.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCsv}
\`\`\`
`;
};

const getLanguageCodeFromFilename = (filename: string): string | null => {
    if (filename.includes(".")) {
        const languageCode = filename.split(".")[0];
        if (languageCodes[languageCode as keyof typeof languageCodes]) {
            return languageCodes[languageCode as keyof typeof languageCodes]
                .name;
        } else if (languageCode.startsWith("en")) {
            return "English";
        }
    }

    return null;
};

const BATCH_SIZE = 32;

(async () => {
    const inputPath = path.resolve(__dirname, options.input);
    if (!fs.existsSync(inputPath)) {
        console.error(`File not found: ${inputPath}`);
        return;
    }

    let inputJSON = {};
    try {
        const inputFile = fs
            .readFileSync(inputPath, "utf-8")
            .replaceAll("\\n", "{{NEWLINE}}");
        inputJSON = JSON.parse(inputFile);
    } catch (e) {
        console.error(`Invalid JSON: ${e}`);
        return;
    }

    const inputLanguage = `"${getLanguageCodeFromFilename(options.input)}"`;
    if (!inputLanguage) {
        console.error(
            "Invalid input file name. Use a valid ISO 639-1 language code as the file name.",
        );
        return;
    }

    const outputLanguage = `"${getLanguageCodeFromFilename(options.output)}"`;
    if (!outputLanguage) {
        console.error(
            "Invalid output file name. Use a valid ISO 639-1 language code as the file name.",
        );
        return;
    }

    console.log(`Translating from ${inputLanguage} to ${outputLanguage}...`);

    const successfulHistory: StartChatParams = { history: [] };
    const generateTranslationChat = model.startChat();
    const verifyTranslationChat = model.startChat();
    const verifyStylingChat = model.startChat();

    const output: { [key: string]: string } = {};

    const flatInput = flatten(inputJSON) as { [key: string]: string };
    const batchStartTime = Date.now();
    for (let i = 0; i < Object.keys(flatInput).length; i += BATCH_SIZE) {
        console.log(
            `Completed ${((i / Object.keys(flatInput).length) * 100).toFixed(2)}%`,
        );
        console.log(
            `Estimated time left: ${((((Date.now() - batchStartTime) / (i + 1)) * (Object.keys(flatInput).length - i)) / 60000).toFixed(1)} minutes`,
        );
        const keys = Object.keys(flatInput).slice(i, i + BATCH_SIZE);
        const input = keys.map((x) => `"${flatInput[x]}"`).join("\n");

        const generatedTranslation = await generateTranslation(
            successfulHistory,
            generateTranslationChat,
            verifyTranslationChat,
            verifyStylingChat,
            inputLanguage,
            outputLanguage,
            input,
            keys,
        );
        if (generatedTranslation === "") {
            console.error("Failed to generate translation");
            return;
        }

        for (let i = 0; i < keys.length; i++) {
            output[keys[i]] = generatedTranslation.split("\n")[i].slice(1, -1);
            console.log(
                `${keys[i]}:\n${flatInput[keys[i]]}\n=>\n${output[keys[i]]}\n`,
            );
        }
        const batchEndTime = Date.now();
        if (batchEndTime - batchStartTime < 3000) {
            console.log(
                `Waiting for ${3000 - (batchEndTime - batchStartTime)}ms...`,
            );
            await delay(3000 - (batchEndTime - batchStartTime));
        }
    }

    const unflattenedOutput = unflatten(output);
    const outputPath = path.resolve(__dirname, options.output);
    const outputText = JSON.stringify(unflattenedOutput, null, 4).replaceAll(
        "{{NEWLINE}}",
        "\\n",
    );
    fs.writeFileSync(outputPath, outputText);
})();

export function delay(delayDuration: number): Promise<void> {
    // eslint-disable-next-line no-promise-executor-return
    return new Promise((resolve) => setTimeout(resolve, delayDuration));
}

/**
 * @param job - the function to retry
 * @param jobArgs - arguments to pass to job
 * @param maxRetries - retries of job before throwing
 * @param firstTry - whether this is the first try
 * @param delayDuration - time (in ms) before attempting job retry
 * @param sendError - whether to send a warning or error
 * @returns the result of job
 */
export async function retryJob<Type>(
    job: (...args: any) => Promise<Type>,
    jobArgs: Array<any>,
    maxRetries: number,
    firstTry: boolean,
    delayDuration?: number,
    sendError = true,
): Promise<Type> {
    if (!firstTry && delayDuration) {
        await delay(delayDuration);
    }

    return job(...jobArgs).catch((err) => {
        if (sendError) {
            console.error(`err = ${err}`);
        } else {
            console.warn(`err = ${err}`);
        }

        if (maxRetries <= 0) {
            throw err;
        }

        return retryJob(job, jobArgs, maxRetries - 1, false, delayDuration);
    });
}
