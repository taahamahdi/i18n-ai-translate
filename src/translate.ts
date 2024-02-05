import { GoogleGenerativeAI, StartChatParams } from "@google/generative-ai";
import { program } from "commander";
import { config } from "dotenv";
import { flatten, unflatten } from "flat";
import path from "path";
import fs from "fs";
import { generateTranslation } from "./generate";
import Chats from "./interfaces/chats";
import {
    delay,
    getAllLanguageCodes,
    getLanguageFromCode,
    getLanguageFromFilename,
} from "./utils";

config({ path: path.resolve(__dirname, "../.env") });

program
    .requiredOption(
        "-i, --input <input>",
        "Source i18n file, in the jsons/ directory if a relative path is given",
    )
    .option(
        "-o, --output <output>",
        "Output i18n file, in the jsons/ directory if a relative path is given",
    )
    .option("-f, --force-language <language name>", "Force language name")
    .option("-A, --all-languages", "Translate to all supported languages")
    .option(
        "-l, --languages [language codes...]",
        "Pass a list of languages to translate to",
    );

program.parse();
const options = program.opts();

const BATCH_SIZE = 32;

const translate = async (inputFileOrPath: string, outputFileOrPath: string) => {
    const genAI = new GoogleGenerativeAI(process.env.API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const jsonFolder = path.resolve(__dirname, "../jsons");
    let inputPath: string;
    if (path.isAbsolute(inputFileOrPath)) {
        inputPath = path.resolve(inputFileOrPath);
    } else {
        inputPath = path.resolve(jsonFolder, inputFileOrPath);
    }

    let outputPath: string;
    if (path.isAbsolute(outputFileOrPath)) {
        outputPath = path.resolve(outputFileOrPath);
    } else {
        outputPath = path.resolve(jsonFolder, outputFileOrPath);
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

    const inputLanguage = `[${getLanguageFromFilename(inputFileOrPath)?.name}]`;
    if (!inputLanguage) {
        console.error(
            "Invalid input file name. Use a valid ISO 639-1 language code as the file name.",
        );
        return;
    }

    let outputLanguage = "";
    if (options.forceLanguage) {
        outputLanguage = `[${options.forceLanguage}]`;
    } else {
        const code = getLanguageFromFilename(outputFileOrPath)?.name;
        if (!code) {
            console.error(
                "Invalid output file name. Use a valid ISO 639-1 language code as the file name. Consider using the --force-language option.",
            );
            return;
        }

        outputLanguage = `[${code}]`;
        if (!outputLanguage) {
            console.error(
                "Invalid output file name. Use a valid ISO 639-1 language code as the file name.",
            );
            return;
        }
    }

    console.log(`Translating from ${inputLanguage} to ${outputLanguage}...`);

    const successfulHistory: StartChatParams = { history: [] };
    const chats: Chats = {
        generateTranslationChat: model.startChat(),
        verifyTranslationChat: model.startChat(),
        verifyStylingChat: model.startChat(),
    };

    const output: { [key: string]: string } = {};

    const flatInput = flatten(inputJSON) as { [key: string]: string };

    // randomize flatInput ordering
    const allKeys = Object.keys(flatInput);
    for (let i = allKeys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allKeys[i], allKeys[j]] = [allKeys[j], allKeys[i]];
    }

    const batchStartTime = Date.now();
    for (let i = 0; i < Object.keys(flatInput).length; i += BATCH_SIZE) {
        if (i > 0) {
            console.log(
                `Completed ${((i / Object.keys(flatInput).length) * 100).toFixed(0)}%`,
            );
            console.log(
                `Estimated time left: ${((((Date.now() - batchStartTime) / (i + 1)) * (Object.keys(flatInput).length - i)) / 60000).toFixed(0)} minutes`,
            );
        }

        const keys = allKeys.slice(i, i + BATCH_SIZE);
        const input = keys.map((x) => `"${flatInput[x]}"`).join("\n");

        const generatedTranslation = await generateTranslation(
            model,
            chats,
            successfulHistory,
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

    // sort the keys
    const sortedOutput: { [key: string]: string } = {};
    Object.keys(flatInput)
        .sort()
        .forEach((key) => {
            sortedOutput[key] = output[key];
        });

    const unflattenedOutput = unflatten(sortedOutput);
    const outputText = JSON.stringify(unflattenedOutput, null, 4).replaceAll(
        "{{NEWLINE}}",
        "\\n",
    );

    console.log(outputText);

    fs.writeFileSync(outputPath, outputText);
    const endTime = Date.now();
    console.log(
        `Actual execution time: ${(endTime - batchStartTime) / 60000} minutes`,
    );
};

(async () => {
    if (!process.env.API_KEY) {
        console.error("API_KEY not found in .env file");
        return;
    }

    if (!options.allLanguages && !options.languages) {
        if (!options.output) {
            console.error("Output file not specified");
            return;
        }

        translate(options.input, options.output);
    } else if (options.languages) {
        if (options.forceLanguage) {
            console.error("Cannot use both --languages and --force-language");
            return;
        }

        if (options.allLanguages) {
            console.error("Cannot use both --all-languages and --languages");
            return;
        }

        if (options.languages.length === 0) {
            console.error("No languages specified");
            return;
        }

        const languageNames = options.languages
            .map((x: string) => getLanguageFromCode(x)?.name)
            .filter((x: string | undefined) => x) as string[];
        console.log(`Translating to ${languageNames.join(", ")}...`);

        let i = 0;
        for (const languageCode of options.languages) {
            i++;
            console.log(
                `Translating ${i}/${options.languages.length} languages...`,
            );
            const output = options.input.replace(
                getLanguageFromFilename(options.input)?.iso639_1,
                languageCode,
            );

            if (options.input === output) {
                continue;
            }

            try {
                await translate(options.input, output);
            } catch (err) {
                console.error(`Failed to translate to ${languageCode}: ${err}`);
            }
        }
    } else {
        if (options.forceLanguage) {
            console.error(
                "Cannot use both --all-languages and --force-language",
            );
            return;
        }

        let i = 0;
        for (const languageCode of getAllLanguageCodes()) {
            i++;
            console.log(
                `Translating ${i}/${getAllLanguageCodes().length} languages...`,
            );
            const output = options.input.replace(
                getLanguageFromFilename(options.input)?.iso639_1,
                languageCode,
            );

            if (options.input === output) {
                continue;
            }

            try {
                await translate(options.input, output);
            } catch (err) {
                console.error(`Failed to translate to ${languageCode}: ${err}`);
            }
        }
    }
})();
