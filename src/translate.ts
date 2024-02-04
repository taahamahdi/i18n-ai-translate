import { GenerativeModel, GoogleGenerativeAI, StartChatParams } from "@google/generative-ai";
import { program } from "commander";
import { config } from "dotenv";
import { flatten, unflatten } from "flat";
import path from "path";
import fs from "fs";
import { generateTranslation } from "./generate";
import Chats from "./interfaces/chats";
import { delay, getAllLanguageCodes, getLanguageFromFilename } from "./utils";

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

program.parse();
const options = program.opts();

const BATCH_SIZE = 32;

const translate = async (model: GenerativeModel, inputFileOrPath: string, outputFileOrPath: string) => {
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

    const inputLanguage = `"${getLanguageFromFilename(inputFileOrPath)?.name}"`;
    if (!inputLanguage) {
        console.error(
            "Invalid input file name. Use a valid ISO 639-1 language code as the file name.",
        );
        return;
    }

    let outputLanguage = "";
    if (options.forceLanguage) {
        outputLanguage = `"${options.forceLanguage}"`;
    } else {
        const code = getLanguageFromFilename(outputFileOrPath)?.name;
        if (!code) {
            console.error(
                "Invalid output file name. Use a valid ISO 639-1 language code as the file name. Consider using the --force-language option.",
            );
            return;
        }

        outputLanguage = `"${code}"`;
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

        const keys = Object.keys(flatInput).slice(i, i + BATCH_SIZE);
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

    const unflattenedOutput = unflatten(output);
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
}

(async () => {
    if (!process.env.API_KEY) {
        console.error("API_KEY not found in .env file");
        return;
    }

    const genAI = new GoogleGenerativeAI(process.env.API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    if (!options.allLanguages) {
        if (!options.output) {
            console.error("Output file not specified");
            return;
        }

        translate(model, options.input, options.output);
    } else {
        if (options.forceLanguage) {
            console.error("Cannot use both --all-languages and --force-language");
            return;
        }

        for (const languageCode of getAllLanguageCodes()) {
            console.log(`Translating to ${getAllLanguageCodes().length} languages...`);
            const output = options.input.replace(
                getLanguageFromFilename(options.input)?.iso639_1,
                languageCode,
            );

            // console.log(output)

            if (options.input === output) {
                continue;
            }

            try {
                await translate(model, options.input, output);
            } catch (err) {
                console.error(`Failed to translate to ${languageCode}: ${err}`);
            }
        }
    }
})();
