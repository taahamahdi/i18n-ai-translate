import { config } from "dotenv";
import { flatten, unflatten } from "flat";
import {
    getAllFilesInPath,
    getAllLanguageCodes,
    getLanguageCodeFromFilename,
    getTranslationDirectoryKey,
} from "./utils";
import { program } from "commander";
import ChatFactory from "./chat_interface/chat_factory";
import Engine from "./enums/engine";
import RateLimiter from "./rate_limiter";
import fs from "fs";
import generateTranslation from "./generate";
import path, { dirname } from "path";
import type { ChatParams, Model } from "./types";
import type Chats from "./interfaces/chats";
import type TranslateDirectoryDiffOptions from "./interfaces/translation_directory_diff_options";
import type TranslateDirectoryOptions from "./interfaces/translation_directory_options";
import type TranslateFileDiffOptions from "./interfaces/translation_file_diff_options";
import type TranslateFileOptions from "./interfaces/translation_file_options";
import type TranslationDiffOptions from "./interfaces/translation_diff_options";
import type TranslationOptions from "./interfaces/translation_options";

const VERSION = "2.0.9";

const DEFAULT_BATCH_SIZE = 32;
const DEFAULT_TEMPLATED_STRING_PREFIX = "{{";
const DEFAULT_TEMPLATED_STRING_SUFFIX = "}}";

config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Translate the input JSON to the given language
 * @param options - The options for the translation
 */
export async function translate(
    options: TranslationOptions,
): Promise<{ [key: string]: string }> {
    if (options.verbose) {
        console.log(
            `Translating from ${options.inputLanguage} to ${options.outputLanguage}...`,
        );
    }

    const rateLimiter = new RateLimiter(
        options.rateLimitMs,
        options.verbose ?? false,
    );

    const chats: Chats = {
        generateTranslationChat: ChatFactory.newChat(
            options.engine,
            options.model,
            options.apiKey,
            rateLimiter,
        ),
        verifyTranslationChat: ChatFactory.newChat(
            options.engine,
            options.model,
            options.apiKey,
            rateLimiter,
        ),
        verifyStylingChat: ChatFactory.newChat(
            options.engine,
            options.model,
            options.apiKey,
            rateLimiter,
        ),
    };

    const output: { [key: string]: string } = {};

    const templatedStringPrefix =
        options.templatedStringPrefix || DEFAULT_TEMPLATED_STRING_PREFIX;

    const templatedStringSuffix =
        options.templatedStringSuffix || DEFAULT_TEMPLATED_STRING_SUFFIX;

    const flatInput = flatten(options.inputJSON, { delimiter: "_" }) as {
        [key: string]: string;
    };

    for (const key in flatInput) {
        if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
            flatInput[key] = flatInput[key].replaceAll(
                "\n",
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

    const batchSize = Number(options.batchSize ?? DEFAULT_BATCH_SIZE);
    const batchStartTime = Date.now();
    for (let i = 0; i < Object.keys(flatInput).length; i += batchSize) {
        if (i > 0 && options.verbose) {
            console.log(
                `Completed ${((i / Object.keys(flatInput).length) * 100).toFixed(0)}%`,
            );

            const roundedEstimatedTimeLeftSeconds = Math.round(
                (((Date.now() - batchStartTime) / (i + 1)) *
                    (Object.keys(flatInput).length - i)) /
                    1000,
            );

            console.log(
                `Estimated time left: ${roundedEstimatedTimeLeftSeconds} seconds`,
            );
        }

        const keys = allKeys.slice(i, i + batchSize);
        const input = keys.map((x) => `"${flatInput[x]}"`).join("\n");

        // eslint-disable-next-line no-await-in-loop
        const generatedTranslation = await generateTranslation({
            chats,
            inputLanguage: `[${options.inputLanguage}]`,
            outputLanguage: `[${options.outputLanguage}]`,
            input,
            keys,
            templatedStringPrefix,
            templatedStringSuffix,
            verboseLogging: options.verbose ?? false,
            ensureChangedTranslation: options.ensureChangedTranslation ?? false,
        });

        if (generatedTranslation === "") {
            console.error(
                `Failed to generate translation for ${options.outputLanguage}`,
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
                "\n",
            );
        }
    }

    const unflattenedOutput = unflatten(sortedOutput, { delimiter: "_" });
    if (options.verbose) {
        const endTime = Date.now();
        const roundedSeconds = Math.round((endTime - batchStartTime) / 1000);
        console.log(`Actual execution time: ${roundedSeconds} seconds`);
    }

    return unflattenedOutput as { [key: string]: string };
}

/**
 * Translate the difference of an input JSON to the given languages
 * @param options - The options for the translation
 */
export async function translateDiff(
    options: TranslationDiffOptions,
): Promise<{ [language: string]: Object }> {
    const flatInputBefore = flatten(options.inputJSONBefore, {
        delimiter: "_",
    }) as {
        [key: string]: string;
    };

    const flatInputAfter = flatten(options.inputJSONAfter, {
        delimiter: "_",
    }) as {
        [key: string]: string;
    };

    const flatToUpdateJSONs: { [language: string]: { [key: string]: string } } =
        {};

    for (const lang in options.toUpdateJSONs) {
        if (Object.prototype.hasOwnProperty.call(options.toUpdateJSONs, lang)) {
            const flatToUpdateJSON = flatten(options.toUpdateJSONs[lang], {
                delimiter: "_",
            }) as {
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

            // eslint-disable-next-line no-await-in-loop
            const translated = await translate({
                engine: options.engine,
                model: options.model,
                chatParams: options.chatParams,
                rateLimitMs: options.rateLimitMs,
                apiKey: options.apiKey,
                inputJSON: addedAndModifiedTranslations,
                inputLanguage: options.inputLanguage,
                outputLanguage: languageCode,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                verbose: options.verbose,
                batchSize: options.batchSize,
            });

            const flatTranslated = flatten(translated, { delimiter: "_" }) as {
                [key: string]: string;
            };

            for (const key in flatTranslated) {
                if (Object.prototype.hasOwnProperty.call(flatTranslated, key)) {
                    flatToUpdateJSONs[languageCode][key] = flatTranslated[key];
                }
            }

            // Sort the keys
            flatToUpdateJSONs[languageCode] = Object.keys(
                flatToUpdateJSONs[languageCode],
            )
                .sort()
                .reduce(
                    (obj, key) => {
                        obj[key] = flatToUpdateJSONs[languageCode][key];
                        return obj;
                    },
                    {} as { [key: string]: string },
                );
        }
    }

    const unflatToUpdateJSONs: { [language: string]: Object } = {};
    for (const lang in flatToUpdateJSONs) {
        if (Object.prototype.hasOwnProperty.call(flatToUpdateJSONs, lang)) {
            unflatToUpdateJSONs[lang] = unflatten(flatToUpdateJSONs[lang], {
                delimiter: "_",
            });
        }
    }

    return unflatToUpdateJSONs;
}

const translateFile = async (options: TranslateFileOptions): Promise<void> => {
    let inputJSON = {};
    try {
        const inputFile = fs.readFileSync(options.inputFilePath, "utf-8");
        inputJSON = JSON.parse(inputFile);
    } catch (e) {
        console.error(`Invalid input JSON: ${e}`);
        return;
    }

    const inputLanguage = getLanguageCodeFromFilename(options.inputFilePath);
    let outputLanguage = "";
    if (options.forceLanguageName) {
        outputLanguage = options.forceLanguageName;
    } else {
        outputLanguage = getLanguageCodeFromFilename(options.inputFilePath);
    }

    try {
        const outputJSON = await translate({
            engine: options.engine,
            model: options.model,
            chatParams: options.chatParams,
            rateLimitMs: options.rateLimitMs,
            apiKey: options.apiKey,
            inputJSON,
            inputLanguage,
            outputLanguage,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
            batchSize: options.batchSize,
        });

        const outputText = JSON.stringify(outputJSON, null, 4);
        fs.writeFileSync(options.outputFilePath, `${outputText}\n`);
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
    const languageCodeToOutputPath: { [language: string]: string } = {};
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
            languageCodeToOutputPath[languageCode] = outputPath;
        } catch (e) {
            console.error(`Invalid output JSON: ${e}`);
        }
    }

    try {
        const outputJSON = await translateDiff({
            engine: options.engine,
            model: options.model,
            chatParams: options.chatParams,
            rateLimitMs: options.rateLimitMs,
            apiKey: options.apiKey,
            inputLanguage: options.inputLanguage,
            inputJSONBefore: inputBeforeJSON,
            inputJSONAfter: inputAfterJSON,
            toUpdateJSONs,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
            batchSize: options.batchSize,
        });

        for (const language in outputJSON) {
            if (Object.prototype.hasOwnProperty.call(outputJSON, language)) {
                const outputText = JSON.stringify(
                    outputJSON[language],
                    null,
                    4,
                );

                fs.writeFileSync(
                    languageCodeToOutputPath[language],
                    `${outputText}\n`,
                );
            }
        }
    } catch (err) {
        console.error(`Failed to translate file diff: ${err}`);
    }
};

const translateDirectory = async (
    options: TranslateDirectoryOptions,
): Promise<void> => {
    // collect all the keys in the format path/to/file/keyName
    // pass it into translate()
    //
    // Some assumptions: in the given path there will be a folder called {inputLanguageInISO-639-1}/
    // and we want to output each translation to new directories in this path
    const jsonFolder = path.resolve(process.cwd(), "jsons");
    let inputPath: string;
    if (path.isAbsolute(options.baseDirectory)) {
        inputPath = path.resolve(options.baseDirectory);
    } else {
        inputPath = path.resolve(jsonFolder, options.baseDirectory);
        if (!fs.existsSync(inputPath)) {
            inputPath = path.resolve(process.cwd(), options.baseDirectory);
        }
    }

    const sourceLanguagePath = path.resolve(
        inputPath,
        options.inputLanguageCode,
    );

    if (!fs.existsSync(sourceLanguagePath)) {
        throw new Error(
            `Source language path does not exist. sourceLanguagePath = ${sourceLanguagePath}`,
        );
    }

    const sourceFilePaths = getAllFilesInPath(sourceLanguagePath);
    const inputJSON: { [key: string]: string } = {};
    for (const sourceFilePath of sourceFilePaths) {
        const fileContents = fs.readFileSync(sourceFilePath, "utf-8");
        const fileJSON = JSON.parse(fileContents);
        const flatJSON = flatten(fileJSON, { delimiter: "_" }) as {
            [key: string]: string;
        };

        for (const key in flatJSON) {
            if (Object.prototype.hasOwnProperty.call(flatJSON, key)) {
                inputJSON[
                    getTranslationDirectoryKey(
                        sourceFilePath,
                        key,
                        options.inputLanguageCode,
                        options.outputLanguageCode,
                    )
                ] = flatJSON[key];
            }
        }
    }

    const inputLanguage = getLanguageCodeFromFilename(
        options.inputLanguageCode,
    );

    let outputLanguage = "";
    if (options.forceLanguageName) {
        outputLanguage = options.forceLanguageName;
    } else {
        outputLanguage = getLanguageCodeFromFilename(
            options.outputLanguageCode,
        );
    }

    try {
        const outputJSON = await translate({
            engine: options.engine,
            model: options.model,
            chatParams: options.chatParams,
            rateLimitMs: options.rateLimitMs,
            apiKey: options.apiKey,
            inputJSON,
            inputLanguage,
            outputLanguage,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
            batchSize: options.batchSize,
        });

        const filesToJSON: { [filePath: string]: { [key: string]: string } } =
            {};

        for (const pathWithKey in outputJSON) {
            if (Object.prototype.hasOwnProperty.call(outputJSON, pathWithKey)) {
                const filePath = pathWithKey.split(":").slice(0, -1).join(":");
                if (!filesToJSON[filePath]) {
                    filesToJSON[filePath] = {};
                }

                const key = pathWithKey.split(":").pop()!;
                filesToJSON[filePath][key] = outputJSON[pathWithKey];
            }
        }

        for (const perFileJSON in filesToJSON) {
            if (
                Object.prototype.hasOwnProperty.call(filesToJSON, perFileJSON)
            ) {
                const unflattenedOutput = unflatten(filesToJSON[perFileJSON], {
                    delimiter: "_",
                });

                const outputText = JSON.stringify(unflattenedOutput, null, 4);
                fs.mkdirSync(dirname(perFileJSON), { recursive: true });
                fs.writeFileSync(perFileJSON, `${outputText}\n`);
            }
        }
    } catch (err) {
        console.error(
            `Failed to translate directory to ${outputLanguage}: ${err}`,
        );
    }
};

const translateDirectoryDiff = async (
    options: TranslateDirectoryDiffOptions,
): Promise<void> => {
    // collect all the keys in the format path|to|file_keyName
    // remove all keys that have unchanged values in pathAfter
    // pass it into translateDiff()
    // split by | and output into keyName
};

program
    .name("i18n-ai-translate")
    .description(
        "Use ChatGPT or Gemini to translate your i18n JSON to any language",
    )
    .version(VERSION);

program
    .command("translate")
    .requiredOption(
        "-i, --input <input>",
        "Source i18n file or path of source language, in the jsons/ directory if a relative path is given",
    )
    .option(
        "-o, --output-languages [language codes...]",
        "A list of languages to translate to",
    )
    .requiredOption(
        "-e, --engine <engine>",
        "Engine to use (chatgpt or gemini)",
    )
    .option(
        "-m, --model <model>",
        "Model to use (e.g. gpt-o1, gpt-4o, gpt-4-turbo, gpt-3.5-turbo, gemini-pro)",
    )
    .option(
        "-r, --rate-limit-ms <rateLimitMs>",
        "How many milliseconds between requests (defaults to 1s for Gemini, 120ms (at 500RPM) for ChatGPT)",
    )
    .option("-f, --force-language-name <language name>", "Force language name")
    .option("-A, --all-languages", "Translate to all supported languages")
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
    .option("-k, --api-key <API key>", "API key")
    .option(
        "--ensure-changed-translation",
        "Each generated translation key must differ from the input (for keys longer than 4)",
        false,
    )
    .option(
        "-n, --batch-size <batchSize>",
        "How many keys to process at a time",
        String(DEFAULT_BATCH_SIZE),
    )
    .option("--verbose", "Print logs about progress", false)
    .action(async (options: any) => {
        let model: Model;
        let chatParams: ChatParams;
        let rateLimitMs = Number(options.rateLimitMs);
        let apiKey: string;
        switch (options.engine) {
            case Engine.Gemini:
                model = options.model || "gemini-pro";
                chatParams = {};
                if (!options.rateLimitMs) {
                    rateLimitMs = 1000;
                }

                if (!process.env.GEMINI_API_KEY && !options.apiKey) {
                    console.error("GEMINI_API_KEY not found in .env file");
                    return;
                } else {
                    apiKey = options.apiKey || process.env.GEMINI_API_KEY;
                }

                break;
            case Engine.ChatGPT:
                model = options.model || "gpt-4o";
                chatParams = {
                    seed: 69420,
                    model,
                    messages: [],
                };
                if (!options.rateLimitMs) {
                    rateLimitMs = 120;
                }

                if (!process.env.OPENAI_API_KEY && !options.apiKey) {
                    console.error("OPENAI_API_KEY not found in .env file");
                    return;
                } else {
                    apiKey = options.apiKey || process.env.OPENAI_API_KEY;
                }

                break;
            default:
                console.error("Invalid engine");
                return;
        }

        if (options.outputLanguages) {
            if (options.forceLanguageName) {
                console.error(
                    "Cannot use both --output-languages and --force-language",
                );
                return;
            }

            if (options.allLanguages) {
                console.error(
                    "Cannot use both --all-languages and --output-languages",
                );
                return;
            }

            if (options.outputLanguages.length === 0) {
                console.error("No languages specified");
                return;
            }

            if (options.verbose) {
                console.log(
                    `Translating to ${options.outputLanguages.join(", ")}...`,
                );
            }

            const jsonFolder = path.resolve(process.cwd(), "jsons");
            let inputPath: string;
            if (path.isAbsolute(options.input)) {
                inputPath = path.resolve(options.input);
            } else {
                inputPath = path.resolve(jsonFolder, options.input);
                if (!fs.existsSync(inputPath)) {
                    inputPath = path.resolve(process.cwd(), options.input);
                }
            }

            if (fs.statSync(inputPath).isFile()) {
                let i = 0;
                for (const languageCode of options.outputLanguages) {
                    i++;
                    console.log(
                        `Translating ${i}/${options.outputLanguages.length} languages...`,
                    );
                    const output = options.input.replace(
                        getLanguageCodeFromFilename(options.input),
                        languageCode,
                    );

                    if (options.input === output) {
                        continue;
                    }

                    let outputPath: string;
                    if (path.isAbsolute(output)) {
                        outputPath = path.resolve(output);
                    } else {
                        outputPath = path.resolve(jsonFolder, output);
                        if (!fs.existsSync(jsonFolder)) {
                            outputPath = path.resolve(process.cwd(), output);
                        }
                    }

                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await translateFile({
                            engine: options.engine,
                            model,
                            chatParams,
                            rateLimitMs,
                            apiKey,
                            inputFilePath: inputPath,
                            outputFilePath: outputPath,
                            templatedStringPrefix:
                                options.templatedStringPrefix,
                            templatedStringSuffix:
                                options.templatedStringSuffix,
                            verbose: options.verbose,
                            ensureChangedTranslation:
                                options.ensureChangedTranslation,
                            batchSize: options.batchSize,
                        });
                    } catch (err) {
                        console.error(
                            `Failed to translate file to ${languageCode}: ${err}`,
                        );
                    }
                }
            } else {
                let i = 0;
                for (const languageCode of options.outputLanguages) {
                    i++;
                    console.log(
                        `Translating ${i}/${options.outputLanguages.length} languages...`,
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
                        await translateDirectory({
                            engine: options.engine,
                            model,
                            chatParams,
                            rateLimitMs,
                            apiKey,
                            baseDirectory: path.resolve(inputPath, ".."),
                            inputLanguageCode: path.basename(inputPath),
                            outputLanguageCode: languageCode,
                            templatedStringPrefix:
                                options.templatedStringPrefix,
                            templatedStringSuffix:
                                options.templatedStringSuffix,
                            verbose: options.verbose,
                            ensureChangedTranslation:
                                options.ensureChangedTranslation,
                            batchSize: options.batchSize,
                        });
                    } catch (err) {
                        console.error(
                            `Failed to translate directory to ${languageCode}: ${err}`,
                        );
                    }
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
                        engine: options.engine,
                        model,
                        chatParams,
                        rateLimitMs,
                        apiKey,
                        inputFilePath: options.input,
                        outputFilePath: output,
                        templatedStringPrefix: options.templatedStringPrefix,
                        templatedStringSuffix: options.templatedStringSuffix,
                        verbose: options.verbose,
                        ensureChangedTranslation:
                            options.ensureChangedTranslation,
                        batchSize: options.batchSize,
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
    .requiredOption(
        "-e, --engine <engine>",
        "Engine to use (chatgpt or gemini)",
    )
    .option(
        "-m, --model <model>",
        "Model to use (e.g. gpt-4o, gpt-4-turbo, gpt-4, gpt-3.5-turbo, gemini-pro)",
    )
    .option(
        "-r, --rate-limit-ms <rateLimitMs>",
        "How many milliseconds between requests (defaults to 1s for Gemini, 120ms (at 500RPM) for ChatGPT)",
    )
    .option("-k, --api-key <API key>", "API key")
    .option(
        "--ensure-changed-translation",
        "Each generated translation key must differ from the input (for keys longer than 4)",
        false,
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
    .option(
        "-n, --batch-size <batchSize>",
        "How many keys to process at a time",
        String(DEFAULT_BATCH_SIZE),
    )
    .option("--verbose", "Print logs about progress", false)
    .action(async (options: any) => {
        let model: Model;
        let chatParams: ChatParams;
        let rateLimitMs = Number(options.rateLimitMs);
        let apiKey: string;
        switch (options.engine) {
            case Engine.Gemini:
                model = options.model || "gemini-pro";
                chatParams = {};
                if (!options.rateLimitMs) {
                    rateLimitMs = 1000;
                }

                if (!process.env.GEMINI_API_KEY && !options.apiKey) {
                    console.error("GEMINI_API_KEY not found in .env file");
                    return;
                } else {
                    apiKey = options.apiKey || process.env.GEMINI_API_KEY;
                }

                break;
            case Engine.ChatGPT:
                model = options.model || "gpt-4o";
                chatParams = {
                    seed: 69420,
                    model,
                    messages: [],
                };
                if (!options.rateLimitMs) {
                    rateLimitMs = 120;
                }

                if (!process.env.OPENAI_API_KEY && !options.apiKey) {
                    console.error("OPENAI_API_KEY not found in .env file");
                    return;
                } else {
                    apiKey = options.apiKey || process.env.OPENAI_API_KEY;
                }

                break;
            default:
                console.error("Invalid engine");
                return;
        }

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
            engine: options.engine,
            model,
            chatParams,
            rateLimitMs,
            apiKey,
            inputLanguage: options.inputLanguage,
            inputBeforeFileOrPath: beforeInputPath,
            inputAfterFileOrPath: afterInputPath,
            outputFilesOrPaths,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
            ensureChangedTranslation: options.ensureChangedTranslation,
            batchSize: options.batchSize,
        });
    });

program.parse();
