import { GoogleGenerativeAI } from "@google/generative-ai";
import { program } from "commander";
import { config } from "dotenv";
import { flatten, unflatten } from "flat";
import { by639_1 as languageCodes } from "iso-language-codes";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

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

const generateTranslation = async (geminiChat: any, inputLanguage: string, outputLanguage: string, batchedInput: string, keys: Array<string>): Promise<string> => {
    const generationPromptText = generationPrompt(inputLanguage, outputLanguage, batchedInput);
    const templatedStringRegex = /{{[^{}]+}}/g;
    const templatedStrings = generationPromptText.match(templatedStringRegex);

    let translated = "";
    try {
    translated = await retryJob(async (): Promise<string> => {
        let generatedContent: any;
        let text = "";
        try {
            generatedContent = await geminiChat.sendMessage(generationPromptText);
            text = generatedContent.response.text();
        } catch (err) {
            return Promise.reject("Failed to generate content")
        }

        if (text === "") {
            return Promise.reject("Failed to generate content");
        }

        if (text.split("\n").length !== keys.length + 2) {
            return Promise.reject(`Invalid number of lines. text = ${text}`);
        }

        try {
            JSON.parse(text);
        } catch (e) {
            console.error(`Invalid JSON: ${e}. text = ${text}`);
            return Promise.reject("Invalid JSON");
        }

        for (const templatedString of templatedStrings || []) {
            if (!text.includes(templatedString)) {
                return Promise.reject(`Missing templated string: ${templatedString}`);
            }
        }

        const verification = await verifyTranslation(inputLanguage, outputLanguage, batchedInput, text);
        if (verification === "NAK") {
            return Promise.reject("Invalid translation");
        }

        return text;
    },
        [],
        10,
        true,
        1000,
        false
    )
    } catch (e) {
        console.error(`Failed to translate: ${e}`);
    }

    return translated.split("\n").slice(1, -1).join("\n");

}

const generationPrompt = ((inputLanguage: string, outputLanguage: string, input: string): string =>
    `Translate the given input from ${inputLanguage} to ${outputLanguage}. Return them in the exact same format (maintaining the source's case sensitivity and whitespace), but replace the values with the translated string. Output only the translations. Do not format them or put them in a code block.

\`\`\`
{
${input}
}
\`\`\`
`
);

const verifyTranslation = async (inputLanguage: string, outputLanguage: string, batchedInput: string, generatedTranslation: string): Promise<string> => {
    const verificationPromptText = verificationPrompt(inputLanguage, outputLanguage, batchedInput, generatedTranslation);
    let verification = "";
    try {
    verification = await retryJob(async (): Promise<string> => {
        const generatedContent = await model.generateContent(verificationPromptText);
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
        3,
        true,
        1000,
        false
    )
    } catch (e) {
        console.error(`Failed to verify: ${e}`);
    }

    return verification;
}

const verificationPrompt = ((inputLanguage: string, outputLanguage: string, input: string, output: string): string =>
`
A "suitable translation" entirely translates ${outputLanguage} to ${inputLanguage} while maintaining the source's case sensitivity and whitespace. It accurately gets the full meaning across. It does not modify templated variable names.

If every line provides a "suitable translation" from ${outputLanguage} to ${inputLanguage}, return ACK. If at least one line is not a "suitable translation", return NAK. Do not return additional output. Do not format your response.

Fields with keys ending with "name" are often multiple English words, and should be translated word by word. For example, "botnews" should not be translated as "bot" and "news" separately.

Fields with keys ending with "title" should be in title case.

${outputLanguage}:
\`\`\`
${output}
\`\`\`

${inputLanguage}:
\`\`\`
{
${input}
}
\`\`\`
`
)

const getLanguageCodeFromFilename = (filename: string): string | null => {
    if (filename.includes(".")) {
        const languageCode = filename.split(".")[0];
        if (languageCodes[languageCode as keyof typeof languageCodes]) {
            return languageCodes[languageCode as keyof typeof languageCodes].name;
        } else if (languageCode.startsWith("en")) {
            return "English";
        }
    }

    return null;
}

const BATCH_SIZE = 10;

(async () => {
    const inputPath = path.resolve(__dirname, options.input);
    if (!fs.existsSync(inputPath)) {
        console.error(`File not found: ${inputPath}`);
        return;
    }

    let inputJSON = {}
    try {
        const inputFile = fs.readFileSync(inputPath, "utf-8").replaceAll("\\n", "{{NEWLINE}}");
        inputJSON = JSON.parse(inputFile);
    } catch (e) {
        console.error(`Invalid JSON: ${e}`);
        return;
    }

    const inputLanguage = getLanguageCodeFromFilename(options.input);
    if (!inputLanguage) {
        console.error("Invalid input file name. Use a valid ISO 639-1 language code as the file name.");
        return;
    }

    const outputLanguage = getLanguageCodeFromFilename(options.output);
    if (!outputLanguage) {
        console.error("Invalid output file name. Use a valid ISO 639-1 language code as the file name.");
        return;
    }

    console.log(`Translating from ${inputLanguage} to ${outputLanguage}...`);

    const generateTranslationChat = model.startChat();

    const output: { [key: string]: string } = {};

    const flatInput = flatten(inputJSON) as { [key: string]: string };
    const batchStartTime = Date.now();
    for (let i = 0; i < Object.keys(flatInput).length; i += BATCH_SIZE) {
        const keys = Object.keys(flatInput).slice(i, i + BATCH_SIZE);
        const batchedInput = keys.map((x) => `    "${x}": "${flatInput[x]}"`).join(",\n");

        const generatedTranslation = await generateTranslation(generateTranslationChat, inputLanguage, outputLanguage, batchedInput, keys);

        for (let i = 0; i < keys.length; i++) {
            const keyLength = keys[i].length + 5;
            output[keys[i]] = generatedTranslation.split("\n")[i].trimStart().slice(keyLength, (i === keys.length - 1) ? -1 : -2);
            console.log(`${keys[i]}:\n${flatInput[keys[i]]}\n=>\n${output[keys[i]]}\n`);
        }
        const batchEndTime = Date.now();
        if (batchEndTime - batchStartTime < 2000) {
            console.log(`Waiting for ${2000 - (batchEndTime - batchStartTime)}ms...`)
            await delay(2000 - (batchEndTime - batchStartTime));
        }
    }

    const unflattenedOutput = unflatten(output);
    const outputPath = path.resolve(__dirname, options.output);
    const outputText = JSON.stringify(unflattenedOutput, null, 4).replaceAll("{{NEWLINE}}", "\\n");
    fs.writeFileSync(outputPath, outputText);
})()

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

