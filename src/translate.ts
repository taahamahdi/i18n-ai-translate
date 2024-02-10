import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import {
    delay,
    getAllLanguageCodes,
    getLanguageCodeFromFilename,
} from "./utils";
import { flatten, unflatten } from "flat";
import { program } from "commander";
import fs from "fs";
import generateTranslation from "./generate";
import path from "path";
import type { StartChatParams } from "@google/generative-ai";
import type Chats from "./interfaces/chats";
import type TranslateFileDiffOptions from "./interfaces/translation_file_diff_options";
import type TranslateFileOptions from "./interfaces/translation_file_options";
import type TranslationDiffOptions from "./interfaces/translation_diff_options";
import type TranslationOptions from "./interfaces/translation_options";

const BATCH_SIZE = 32;
const DEFAULT_TEMPLATED_STRING_PREFIX = "{{";
const DEFAULT_TEMPLATED_STRING_SUFFIX = "}}";

config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Translate the difference of an input JSON to the given languages
 * @param options - The options for the translation
 */
export async function translateDiff(
    options: TranslationDiffOptions,
): Promise<{ [language: string]: Object }> {
    const flatInputBefore = flatten(options.inputJSONBefore) as {
        [key: string]: string;
    };

    const flatInputAfter = flatten(options.inputJSONAfter) as {
        [key: string]: string;
    };

    const flatToUpdateJSONs: { [language: string]: { [key: string]: string } } =
        {};

    for (const lang in options.toUpdateJSONs) {
        if (Object.prototype.hasOwnProperty.call(options.toUpdateJSONs, lang)) {
            const flatToUpdateJSON = flatten(options.toUpdateJSONs[lang]) as {
                [key: string]: string;
            };

            flatToUpdateJSONs[lang] = flatToUpdateJSON;
        }
    }

    const addedKeys = [];
    const modifiedKeys = [];
    const deletedKeys = [];

    for (const key in flatInputBefore) {
        if (flatInputBefore[key] !== flatInputAfter[key]) {
            if (flatInputAfter[key] === undefined) {
                deletedKeys.push(key);
            } else {
                modifiedKeys.push(key);
            }
        }
    }

    for (const key in flatInputAfter) {
        if (flatInputBefore[key] === undefined) {
            addedKeys.push(key);
        }
    }

    if (options.verbose) {
        console.log(`Added keys: ${addedKeys.join("\n")}\n`);
        console.log(`Modified keys: ${modifiedKeys.join("\n")}\n`);
        console.log(`Deleted keys: ${deletedKeys.join("\n")}\n`);
    }

    for (const key of deletedKeys) {
        for (const lang in flatToUpdateJSONs) {
            if (Object.prototype.hasOwnProperty.call(flatToUpdateJSONs, lang)) {
                delete flatToUpdateJSONs[lang][key];
            }
        }
    }

    for (const languageCode in flatToUpdateJSONs) {
        if (
            Object.prototype.hasOwnProperty.call(
                flatToUpdateJSONs,
                languageCode,
            )
        ) {
            const addedAndModifiedTranslations: { [key: string]: string } = {};
            for (const key of addedKeys) {
                addedAndModifiedTranslations[key] = flatInputAfter[key];
            }

            for (const key of modifiedKeys) {
                addedAndModifiedTranslations[key] = flatInputAfter[key];
            }

            // eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-use-before-define
            const translated = await translate({
                apiKey: options.apiKey,
                inputJSON: addedAndModifiedTranslations,
                inputLanguage: options.inputLanguage,
                outputLanguage: languageCode,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                verbose: options.verbose,
            });

            const flatTranslated = flatten(translated) as {
                [key: string]: string;
            };

            for (const key in flatTranslated) {
                if (Object.prototype.hasOwnProperty.call(flatTranslated, key)) {
                    flatToUpdateJSONs[languageCode][key] = flatTranslated[key];
                }
            }
        }
    }

    const unflatToUpdateJSONs: { [language: string]: Object } = {};
    for (const lang in flatToUpdateJSONs) {
        if (Object.prototype.hasOwnProperty.call(flatToUpdateJSONs, lang)) {
            unflatToUpdateJSONs[lang] = unflatten(flatToUpdateJSONs[lang]);
        }
    }

    if (options.verbose) {
        console.log("Updated JSONs:");
        console.log(unflatToUpdateJSONs);
    }

    return unflatToUpdateJSONs;
}

/**
 * Translate the input JSON to the given language
 * @param options - The options for the translation
 */
export async function translate(options: TranslationOptions): Promise<Object> {
    if (options.verbose) {
        console.log(
            `Translating from ${options.inputLanguage} to ${options.outputLanguage}...`,
        );
    }

    const genAI = new GoogleGenerativeAI(options.apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const successfulHistory: StartChatParams = { history: [] };
    const chats: Chats = {
        generateTranslationChat: model.startChat(),
        verifyTranslationChat: model.startChat(),
        verifyStylingChat: model.startChat(),
    };

    const output: { [key: string]: string } = {};

    const templatedStringPrefix =
        options.templatedStringPrefix || DEFAULT_TEMPLATED_STRING_PREFIX;

    const templatedStringSuffix =
        options.templatedStringSuffix || DEFAULT_TEMPLATED_STRING_SUFFIX;

    const flatInput = flatten(options.inputJSON) as { [key: string]: string };
    for (const key in flatInput) {
        if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
            flatInput[key] = flatInput[key].replaceAll(
                "\\n",
                `${templatedStringPrefix}NEWLINE${templatedStringSuffix}`,
            );
        }
    }

    // randomize flatInput ordering
    const allKeys = Object.keys(flatInput);
    for (let i = allKeys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allKeys[i], allKeys[j]] = [allKeys[j], allKeys[i]];
    }

    const batchStartTime = Date.now();
    for (let i = 0; i < Object.keys(flatInput).length; i += BATCH_SIZE) {
        if (i > 0 && options.verbose) {
            console.log(
                `Completed ${((i / Object.keys(flatInput).length) * 100).toFixed(0)}%`,
            );

            console.log(
                `Estimated time left: ${((((Date.now() - batchStartTime) / (i + 1)) * (Object.keys(flatInput).length - i)) / 60000).toFixed(0)} minutes`,
            );
        }

        const keys = allKeys.slice(i, i + BATCH_SIZE);
        const input = keys.map((x) => `"${flatInput[x]}"`).join("\n");

        // eslint-disable-next-line no-await-in-loop
        const generatedTranslation = await generateTranslation(
            model,
            chats,
            successfulHistory,
            `[${options.inputLanguage}]`,
            `[${options.outputLanguage}]`,
            input,
            keys,
            templatedStringPrefix,
            templatedStringSuffix,
            options.verbose ?? false,
            options.ensureChangedTranslation ?? false,
        );

        if (generatedTranslation === "") {
            console.error(
                `Failed to generate translation for ${options.inputLanguage}`,
            );
            break;
        }

        for (let j = 0; j < keys.length; j++) {
            output[keys[j]] = generatedTranslation.split("\n")[j].slice(1, -1);

            if (options.verbose)
                console.log(
                    `${keys[j]}:\n${flatInput[keys[j]]}\n=>\n${output[keys[j]]}\n`,
                );
        }

        const batchEndTime = Date.now();
        if (batchEndTime - batchStartTime < 3000) {
            if (options.verbose) {
                console.log(
                    `Waiting for ${3000 - (batchEndTime - batchStartTime)}ms...`,
                );
            }

            // eslint-disable-next-line no-await-in-loop
            await delay(3000 - (batchEndTime - batchStartTime));
        }
    }

    // sort the keys
    const sortedOutput: { [key: string]: string } = {};
    for (const key of Object.keys(flatInput).sort()) {
        sortedOutput[key] = output[key];
    }

    for (const key in sortedOutput) {
        if (Object.prototype.hasOwnProperty.call(sortedOutput, key)) {
            sortedOutput[key] = sortedOutput[key].replaceAll(
                `${templatedStringPrefix}NEWLINE${templatedStringSuffix}`,
                "\\n",
            );
        }
    }

    const unflattenedOutput = unflatten(sortedOutput);
    if (options.verbose) {
        const endTime = Date.now();
        console.log(
            `Actual execution time: ${(endTime - batchStartTime) / 60000} minutes`,
        );
    }

    return unflattenedOutput as Object;
}

const translateFile = async (options: TranslateFileOptions): Promise<void> => {
    const jsonFolder = path.resolve(process.cwd(), "jsons");
    let inputPath: string;
    if (path.isAbsolute(options.inputFileOrPath)) {
        inputPath = path.resolve(options.inputFileOrPath);
    } else {
        inputPath = path.resolve(jsonFolder, options.inputFileOrPath);
        if (!fs.existsSync(inputPath)) {
            inputPath = path.resolve(process.cwd(), options.inputFileOrPath);
        }
    }

    let outputPath: string;
    if (path.isAbsolute(options.outputFileOrPath)) {
        outputPath = path.resolve(options.outputFileOrPath);
    } else {
        outputPath = path.resolve(jsonFolder, options.outputFileOrPath);
        if (!fs.existsSync(jsonFolder)) {
            outputPath = path.resolve(process.cwd(), options.outputFileOrPath);
        }
    }

    let inputJSON = {};
    try {
        const inputFile = fs.readFileSync(inputPath, "utf-8");
        inputJSON = JSON.parse(inputFile);
    } catch (e) {
        console.error(`Invalid input JSON: ${e}`);
        return;
    }

    const inputLanguage = getLanguageCodeFromFilename(options.inputFileOrPath);

    if (!inputLanguage) {
        throw new Error(
            "Invalid input file name. Use a valid ISO 639-1 language code as the file name.",
        );
    }

    let outputLanguage = "";
    if (options.forceLanguageName) {
        outputLanguage = options.forceLanguageName;
    } else {
        const language = getLanguageCodeFromFilename(options.outputFileOrPath);

        if (!language) {
            throw new Error(
                "Invalid output file name. Use a valid ISO 639-1 language code as the file name. Consider using the --force-language option.",
            );
        }

        outputLanguage = language;
    }

    try {
        const outputJSON = await translate({
            apiKey: options.apiKey,
            inputJSON,
            inputLanguage,
            outputLanguage,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
        });

        const outputText = JSON.stringify(outputJSON, null, 4);

        if (options.verbose) {
            console.log(outputText);
        }

        fs.writeFileSync(outputPath, outputText);
    } catch (err) {
        console.error(`Failed to translate file to ${outputLanguage}: ${err}`);
    }
};

const translateFileDiff = async (
    options: TranslateFileDiffOptions,
): Promise<void> => {
    const jsonFolder = path.resolve(process.cwd(), "jsons");
    let inputBeforePath: string;
    let inputAfterPath: string;
    if (path.isAbsolute(options.inputBeforeFileOrPath)) {
        inputBeforePath = path.resolve(options.inputBeforeFileOrPath);
    } else {
        inputBeforePath = path.resolve(
            jsonFolder,
            options.inputBeforeFileOrPath,
        );

        if (!fs.existsSync(inputBeforePath)) {
            inputBeforePath = path.resolve(
                process.cwd(),
                options.inputBeforeFileOrPath,
            );
        }
    }

    if (path.isAbsolute(options.inputAfterFileOrPath)) {
        inputAfterPath = path.resolve(options.inputAfterFileOrPath);
    } else {
        inputAfterPath = path.resolve(jsonFolder, options.inputAfterFileOrPath);
    }

    const outputPaths: Array<string> = [];
    for (const outputFileOrPath of options.outputFilesOrPaths) {
        let outputPath: string;
        if (path.isAbsolute(outputFileOrPath)) {
            outputPath = path.resolve(outputFileOrPath);
        } else {
            outputPath = path.resolve(jsonFolder, outputFileOrPath);
            if (!fs.existsSync(jsonFolder)) {
                outputPath = path.resolve(process.cwd(), outputFileOrPath);
            }
        }

        outputPaths.push(outputPath);
    }

    let inputBeforeJSON = {};
    let inputAfterJSON = {};
    try {
        let inputFile = fs.readFileSync(inputBeforePath, "utf-8");
        inputBeforeJSON = JSON.parse(inputFile);
        inputFile = fs.readFileSync(inputAfterPath, "utf-8");
        inputAfterJSON = JSON.parse(inputFile);
    } catch (e) {
        console.error(`Invalid input JSON: ${e}`);
        return;
    }

    const toUpdateJSONs: { [language: string]: Object } = {};
    for (const outputPath of outputPaths) {
        const languageCode = getLanguageCodeFromFilename(
            path.basename(outputPath),
        );

        if (!languageCode) {
            throw new Error(
                "Invalid output file name. Use a valid ISO 639-1 language code as the file name.",
            );
        }

        try {
            const outputFile = fs.readFileSync(outputPath, "utf-8");
            toUpdateJSONs[languageCode] = JSON.parse(outputFile);
        } catch (e) {
            console.error(`Invalid output JSON: ${e}`);
        }
    }

    try {
        const outputJSON = await translateDiff({
            apiKey: options.apiKey,
            inputLanguage: options.inputLanguage,
            inputJSONBefore: inputBeforeJSON,
            inputJSONAfter: inputAfterJSON,
            toUpdateJSONs,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
        });

        for (const language in outputJSON) {
            if (Object.prototype.hasOwnProperty.call(outputJSON, language)) {
                const outputText = JSON.stringify(
                    outputJSON[language],
                    null,
                    4,
                );

                if (options.verbose) {
                    console.log(outputText);
                }

                fs.writeFileSync(
                    path.resolve(jsonFolder, `${language}.json`),
                    outputText,
                );
            }
        }
    } catch (err) {
        console.error(`Failed to translate file diff: ${err}`);
    }
};

program
    .name("i18n-ai-translate")
    .description(
        "Use Google Gemini to translate your i18n JSON to any language",
    )
    .version("1.1.0");

program
    .command("translate")
    .requiredOption(
        "-i, --input <input>",
        "Source i18n file, in the jsons/ directory if a relative path is given",
    )
    .option(
        "-o, --output <output>",
        "Output i18n file, in the jsons/ directory if a relative path is given",
    )
    .option("-f, --force-language-name <language name>", "Force language name")
    .option("-A, --all-languages", "Translate to all supported languages")
    .option(
        "-l, --languages [language codes...]",
        "Pass a list of languages to translate to",
    )
    .option(
        "-p, --templated-string-prefix <prefix>",
        "Prefix for templated strings",
        DEFAULT_TEMPLATED_STRING_PREFIX,
    )
    .option(
        "-s, --templated-string-suffix <suffix>",
        "Suffix for templated strings",
        DEFAULT_TEMPLATED_STRING_SUFFIX,
    )
    .option("-k, --api-key <Gemini API key>", "Gemini API key")
    .option(
        "--ensure-changed-translation",
        "Each generated translation key must differ from the input (for keys longer than 4)",
        false,
    )
    .option("--verbose", "Print logs about progress", false)
    .action(async (options: any) => {
        if (!process.env.API_KEY && !options.apiKey) {
            console.error("API_KEY not found in .env file");
            return;
        }

        const apiKey = options.apiKey || process.env.API_KEY;

        if (!options.allLanguages && !options.languages) {
            if (!options.output) {
                console.error("Output file not specified");
                return;
            }

            await translateFile({
                apiKey,
                inputFileOrPath: options.input,
                outputFileOrPath: options.output,
                forceLanguageName: options.forceLanguageName,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                verbose: options.verbose,
            });
        } else if (options.languages) {
            if (options.forceLanguageName) {
                console.error(
                    "Cannot use both --languages and --force-language",
                );
                return;
            }

            if (options.allLanguages) {
                console.error(
                    "Cannot use both --all-languages and --languages",
                );
                return;
            }

            if (options.languages.length === 0) {
                console.error("No languages specified");
                return;
            }

            if (options.verbose) {
                console.log(
                    `Translating to ${options.languages.join(", ")}...`,
                );
            }

            let i = 0;
            for (const languageCode of options.languages) {
                i++;
                console.log(
                    `Translating ${i}/${options.languages.length} languages...`,
                );
                const output = options.input.replace(
                    getLanguageCodeFromFilename(options.input),
                    languageCode,
                );

                if (options.input === output) {
                    continue;
                }

                try {
                    // eslint-disable-next-line no-await-in-loop
                    await translateFile({
                        apiKey,
                        inputFileOrPath: options.input,
                        outputFileOrPath: output,
                        templatedStringPrefix: options.templatedStringPrefix,
                        templatedStringSuffix: options.templatedStringSuffix,
                        verbose: options.verbose,
                    });
                } catch (err) {
                    console.error(
                        `Failed to translate to ${languageCode}: ${err}`,
                    );
                }
            }
        } else {
            if (options.forceLanguageName) {
                console.error(
                    "Cannot use both --all-languages and --force-language",
                );
                return;
            }

            console.warn(
                "Some languages may fail to translate due to the model's limitations",
            );

            let i = 0;
            for (const languageCode of getAllLanguageCodes()) {
                i++;
                if (options.verbose) {
                    console.log(
                        `Translating ${i}/${getAllLanguageCodes().length} languages...`,
                    );
                }

                const output = options.input.replace(
                    getLanguageCodeFromFilename(options.input),
                    languageCode,
                );

                if (options.input === output) {
                    continue;
                }

                try {
                    // eslint-disable-next-line no-await-in-loop
                    await translateFile({
                        apiKey,
                        inputFileOrPath: options.input,
                        outputFileOrPath: output,
                        templatedStringPrefix: options.templatedStringPrefix,
                        templatedStringSuffix: options.templatedStringSuffix,
                        verbose: options.verbose,
                    });
                } catch (err) {
                    console.error(
                        `Failed to translate to ${languageCode}: ${err}`,
                    );
                }
            }
        }
    });

program
    .command("diff")
    .requiredOption(
        "-b, --before <fileBefore>",
        "Source i18n file before changes, in the jsons/ directory if a relative path is given",
    )
    .requiredOption(
        "-a, --after <fileAfter>",
        "Source i18n file after changes, in the jsons/ directory if a relative path is given",
    )
    .requiredOption(
        "-l, --input-language <inputLanguage>",
        "The full input language name",
    )
    .option("-k, --api-key <Gemini API key>", "Gemini API key")
    .option(
        "--ensure-changed-translation",
        "Each generated translation key must differ from the input (for keys longer than 4)",
        false,
    )
    .option("--verbose", "Print logs about progress", false)
    .action(async (options: any) => {
        if (!process.env.API_KEY && !options.apiKey) {
            console.error("API_KEY not found in .env file");
            return;
        }

        const apiKey = options.apiKey || process.env.API_KEY;

        const jsonFolder = path.resolve(process.cwd(), "jsons");
        let beforeInputPath: string;
        if (path.isAbsolute(options.before)) {
            beforeInputPath = path.resolve(options.before);
        } else {
            beforeInputPath = path.resolve(jsonFolder, options.before);
            if (!fs.existsSync(beforeInputPath)) {
                beforeInputPath = path.resolve(process.cwd(), options.before);
            }
        }

        let afterInputPath: string;
        if (path.isAbsolute(options.after)) {
            afterInputPath = path.resolve(options.after);
        } else {
            afterInputPath = path.resolve(jsonFolder, options.after);
            if (!fs.existsSync(afterInputPath)) {
                afterInputPath = path.resolve(process.cwd(), options.after);
            }
        }

        // Ensure they're in the same path
        if (path.dirname(beforeInputPath) !== path.dirname(afterInputPath)) {
            console.error("Input files are not in the same directory");
            return;
        }

        // Get all the *json files from the same path as beforeInputPath
        const outputFilesOrPaths = fs
            .readdirSync(path.dirname(beforeInputPath))
            .filter((file) => file.endsWith(".json"))
            .filter(
                (file) =>
                    file !== path.basename(beforeInputPath) &&
                    file !== path.basename(afterInputPath),
            )
            .map((file) => path.resolve(path.dirname(beforeInputPath), file));

        await translateFileDiff({
            apiKey,
            inputLanguage: options.inputLanguage,
            inputBeforeFileOrPath: beforeInputPath,
            inputAfterFileOrPath: afterInputPath,
            outputFilesOrPaths,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
        });
    });

// TODO: options to adjust batch size and indentation

program.parse();
