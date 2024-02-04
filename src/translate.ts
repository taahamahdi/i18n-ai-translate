import { GoogleGenerativeAI, StartChatParams } from "@google/generative-ai";
import { program } from "commander";
import { config } from "dotenv";
import { flatten, unflatten } from "flat";
import path from "path";
import fs from "fs";
import { generateTranslation } from "./generate";
import Chats from "./interfaces/chats";
import { delay, getLanguageCodeFromFilename } from "./utils";

config({ path: path.resolve(__dirname, "../.env") });

program
    .requiredOption(
        "-i, --input <input>",
        "Source i18n file, in the jsons/ directory if a relative path is given",
    )
    .requiredOption(
        "-o, --output <output>",
        "Output i18n file, in the jsons/ directory if a relative path is given",
    )
    .option("-f, --force-language <language name>", "Force language name");

program.parse();
const options = program.opts();

// const BATCH_SIZE = 32;

(async () => {
    if (!process.env.API_KEY) {
        console.error("API_KEY not found in .env file");
        return;
    }

    const genAI = new GoogleGenerativeAI(process.env.API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const jsonFolder = path.resolve(__dirname, "../jsons");
    let inputPath: string;
    if (path.isAbsolute(options.input)) {
        inputPath = path.resolve(options.input);
    } else {
        inputPath = path.resolve(jsonFolder, options.input);
    }

    let outputPath: string;
    if (path.isAbsolute(options.output)) {
        outputPath = path.resolve(options.output);
    } else {
        outputPath = path.resolve(jsonFolder, options.output);
    }

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

    let outputLanguage = "";
    if (options.forceLanguage) {
        outputLanguage = `"${options.forceLanguage}"`;
    } else {
        const code = getLanguageCodeFromFilename(options.output);
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

    const groupedFlatInput = groupBySecondLastKey(flatInput);

    // Put the keys in random order:
    const randomGroupedFlatInput: GroupedObject = {};
    const keys = Object.keys(groupedFlatInput);
    keys.sort(() => Math.random() - 0.5);
    keys.forEach((key) => {
        randomGroupedFlatInput[key] = groupedFlatInput[key];
    });

    const batchStartTime = Date.now();
    let i = 0
    for (const group in randomGroupedFlatInput) {
        if (i > 0) {
            console.log(
                `Completed ${((i / Object.keys(flatInput).length) * 100).toFixed(0)}%`,
            );
            console.log(
                `Estimated time left: ${((((Date.now() - batchStartTime) / (i + 1)) * (Object.keys(flatInput).length - i)) / 60000).toFixed(0)} minutes`,
            );
        }

        const keys = Object.keys(randomGroupedFlatInput[group]);
        i += keys.length
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
})();

type FlattenedObject = { [key: string]: any };
type GroupedObject = { [group: string]: FlattenedObject };

function groupBySecondLastKey(flatObj: FlattenedObject): GroupedObject {
    const grouped: GroupedObject = {};

    Object.entries(flatObj).forEach(([key, value]) => {
        // Split the key to analyze its structure
        const parts = key.split('.');
        // Determine the group name (second-last part of the key)
        // Default to '__root__' if there's no second-last part
        const groupName = parts.length > 1 ? parts[parts.length - 2] : '__root__';

        // Initialize the group in the result if it doesn't exist
        if (!grouped[groupName]) {
            grouped[groupName] = {};
        }

        // Assign the value to the correct group while preserving the full key
        grouped[groupName][key] = value;
    });

    return grouped;
}
