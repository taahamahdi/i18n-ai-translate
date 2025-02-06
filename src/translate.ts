import {
    DEFAULT_BATCH_SIZE,
    DEFAULT_TEMPLATED_STRING_PREFIX,
    DEFAULT_TEMPLATED_STRING_SUFFIX,
    FLATTEN_DELIMITER,
} from "./constants";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { distance } from "fastest-levenshtein";
import { flatten, unflatten } from "flat";
import {
    getAllFilesInPath,
    getLanguageCodeFromFilename,
    getTranslationDirectoryKey,
} from "./utils";
import ChatFactory from "./chat_interface/chat_factory";
import RateLimiter from "./rate_limiter";
import fs from "fs";
import generateTranslation from "./generate";
import path, { dirname } from "path";
import xml2js from "xml2js";
import type { TranslateItem } from "./types";
import type Chats from "./interfaces/chats";
import type TranslateDiffOptions from "./interfaces/translate_diff_options";
import type TranslateDirectoryDiffOptions from "./interfaces/translate_directory_diff_options";
import type TranslateDirectoryOptions from "./interfaces/translate_directory_options";
import type TranslateFileDiffOptions from "./interfaces/translate_file_diff_options";
import type TranslateFileOptions from "./interfaces/translate_file_options";
import type TranslateOptions from "./interfaces/translate_options";

/**
 * Translate the input JSON to the given language
 * @param options - The options for the translation
 */
export async function translate(options: TranslateOptions): Promise<Object> {
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
            rateLimiter,
            options.apiKey,
            options.host,
        ),
        verifyStylingChat: ChatFactory.newChat(
            options.engine,
            options.model,
            rateLimiter,
            options.apiKey,
            options.host,
        ),
        verifyTranslationChat: ChatFactory.newChat(
            options.engine,
            options.model,
            rateLimiter,
            options.apiKey,
            options.host,
        ),
    };

    const flatInput = flatten(options.inputJSON, {
        delimiter: FLATTEN_DELIMITER,
    }) as {
        [key: string]: string;
    };

    replaceNewlinesWithPlaceholder(options, flatInput);

    // groupSimilarValues(flatInput)

    let translateItemArray: TranslateItem[] = [];

    for (const key in flatInput) {
        if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
            translateItemArray.push(createJsonInput(key, flatInput[key]));
        }
    }

    const batchSize = Number(options.batchSize ?? DEFAULT_BATCH_SIZE);
    const batchStartTime = Date.now();
    const generatedTranslation: TranslateItem[] = [];
    const totalItems = translateItemArray.length;
    let processedItems = 0;
    let enqueuedItems = 0;
    while (translateItemArray.length > 0) {
        if (processedItems > 0 && options.verbose) {
            console.log(
                `Completed ${((processedItems / totalItems) * 100).toFixed(0)}%`,
            );

            const roundedEstimatedTimeLeftSeconds = Math.round(
                (((Date.now() - batchStartTime) / (processedItems + 1)) *
                    (totalItems - processedItems)) /
                    1000,
            );

            console.log(
                `Estimated time left: ${roundedEstimatedTimeLeftSeconds} seconds`,
            );
        }

        const batchTranslateItemArray = translateItemArray.slice(0, batchSize);
        enqueuedItems += batchTranslateItemArray.length;
        // eslint-disable-next-line no-await-in-loop
        const result = await generateTranslation({
            chats,
            ensureChangedTranslation: options.ensureChangedTranslation ?? false,
            translateItems: batchTranslateItemArray,
            inputLanguage: `[${options.inputLanguage}]`,
            outputLanguage: `[${options.outputLanguage}]`,
            overridePrompt: options.overridePrompt,
            skipStylingVerification: options.skipStylingVerification ?? false,
            skipTranslationVerification:
                options.skipTranslationVerification ?? false,
            verboseLogging: options.verbose ?? false,
        });
        console.log(result);
        if (!result) {
            console.error(
                `Failed to generate translation for ${options.outputLanguage}`,
            );
            break;
        }

        for (const translatedItem of result) {
            const index = translateItemArray.findIndex(
                (item) => item.key === translatedItem.key,
            );

            if (index !== -1) {
                translateItemArray.splice(index, 1);
                generatedTranslation.push(translatedItem);
            }

            processedItems++;
        }
    }

    console.log(processedItems, enqueuedItems);

    const output: { [key: string]: string } = {};

    // Convert array of TranslateItem objects to output
    for (const translation of generatedTranslation) {
        output[translation.key] = translation.translatedText;
    }

    // sort the keys
    const sortedOutput: { [key: string]: string } = {};
    for (const key of Object.keys(flatInput).sort()) {
        sortedOutput[key] = output[key];
    }

    replacePlaceholderWithNewLines(options, sortedOutput);

    const unflattenedOutput = unflatten(sortedOutput, {
        delimiter: FLATTEN_DELIMITER,
    });

    if (options.verbose) {
        const endTime = Date.now();
        const roundedSeconds = Math.round((endTime - batchStartTime) / 1000);
        console.log(`Actual execution time: ${roundedSeconds} seconds`);
    }

    return unflattenedOutput as Object;
}

function groupSimilarValues(flatInput: { [key: string]: string }) {
    const groups: Array<{ [key: string]: string }> = [];
    for (const key in flatInput) {
        if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
            const val = flatInput[key];

            const existingGroup = groups.find((group) =>
                Object.values(group).some((entry) => {
                    const distPercent =
                        distance(val, entry) /
                        Math.max(val.length, entry.length);

                    return distPercent < 0.3;
                }),
            );

            if (existingGroup) {
                existingGroup[key] = val;
            } else {
                groups.push({ [key]: val });
            }
        }
    }

    for (let i = groups.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [groups[i], groups[j]] = [groups[j], groups[i]];
    }

    flatInput = {};
    for (const groupObj of groups) {
        for (const [k, v] of Object.entries(groupObj)) {
            flatInput[k] = v;
        }
    }
}

function replaceNewlinesWithPlaceholder(
    options: TranslateOptions,
    flatInput: { [key: string]: string },
) {
    const templatedStringPrefix =
        options.templatedStringPrefix || DEFAULT_TEMPLATED_STRING_PREFIX;

    const templatedStringSuffix =
        options.templatedStringSuffix || DEFAULT_TEMPLATED_STRING_SUFFIX;

    const translateItemArray: TranslateItem[] = [];

    for (const key in flatInput) {
        if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
            flatInput[key] = flatInput[key].replaceAll(
                "\n",
                `${templatedStringPrefix}NEWLINE${templatedStringSuffix}`,
            );

            translateItemArray.push(createJsonInput(key, flatInput[key]));
        }
    }
}

function replacePlaceholderWithNewLines(
    options: TranslateOptions,
    sortedOutput: { [key: string]: string },
) {
    const templatedStringPrefix =
        options.templatedStringPrefix || DEFAULT_TEMPLATED_STRING_PREFIX;

    const templatedStringSuffix =
        options.templatedStringSuffix || DEFAULT_TEMPLATED_STRING_SUFFIX;

    for (const key in sortedOutput) {
        if (Object.prototype.hasOwnProperty.call(sortedOutput, key)) {
            sortedOutput[key] = sortedOutput[key].replaceAll(
                `${templatedStringPrefix}NEWLINE${templatedStringSuffix}`,
                "\n",
            );
        }
    }
}

function createJsonInput(key: string, originalText: string): TranslateItem {
    return {
        context: "",
        key: key,
        originalText: originalText,
        translatedText: "",
    } as TranslateItem;
}

/**
 * Translate the difference of an input JSON to the given languages
 * @param options - The options for the translation
 */
export async function translateDiff(
    options: TranslateDiffOptions,
): Promise<{ [language: string]: Object }> {
    const flatInputBefore = flatten(options.inputJSONBefore, {
        delimiter: FLATTEN_DELIMITER,
    }) as {
        [key: string]: string;
    };

    const flatInputAfter = flatten(options.inputJSONAfter, {
        delimiter: FLATTEN_DELIMITER,
    }) as {
        [key: string]: string;
    };

    const flatToUpdateJSONs: { [language: string]: { [key: string]: string } } =
        {};

    for (const lang in options.toUpdateJSONs) {
        if (Object.prototype.hasOwnProperty.call(options.toUpdateJSONs, lang)) {
            const flatToUpdateJSON = flatten(options.toUpdateJSONs[lang], {
                delimiter: FLATTEN_DELIMITER,
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
                apiKey: options.apiKey,
                batchSize: options.batchSize,
                chatParams: options.chatParams,
                engine: options.engine,
                ensureChangedTranslation: options.ensureChangedTranslation,
                host: options.host,
                inputJSON: addedAndModifiedTranslations,
                inputLanguage: options.inputLanguage,
                model: options.model,
                outputLanguage: languageCode,
                overridePrompt: options.overridePrompt,
                rateLimitMs: options.rateLimitMs,
                skipStylingVerification: options.skipStylingVerification,
                skipTranslationVerification:
                    options.skipTranslationVerification,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                verbose: options.verbose,
            });

            const flatTranslated = flatten(translated, {
                delimiter: FLATTEN_DELIMITER,
            }) as {
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
                delimiter: FLATTEN_DELIMITER,
            });
        }
    }

    return unflatToUpdateJSONs;
}

/**
 * Wraps translate to take an input file and output its translation to another file
 * @param options - The file translation's options
 */
export async function translateFile(
    options: TranslateFileOptions,
): Promise<void> {
    //
    // const inputFile = fs.readFileSync(options.inputFilePath, "utf-8");

    // // Parse the XML data
    // const parser = new xml2js.Parser({
    //     explicitArray: false,
    //     mergeAttrs: true,
    // });
    // parser.parseString(inputFile, (err, result) => {
    //     if (err) {
    //         console.error("Error parsing XML:", err);
    //         return;
    //     }

    //     // Do something with the parsed result
    //     // console.log(JSON.stringify(result, null, 2)); // Log the parsed JSON
    //     var builder = new xml2js.Builder();
    //     var xml = builder.buildObject(result);
    //     console.log(xml);
    // });

    // const parser = new XMLParser();
    // const jsonObj = parser.parse(inputFile);

    // // Convert back to XML
    // const builder = new XMLBuilder();
    // const xml = builder.build(jsonObj);
    // console.log(xml); // Converted back to XML

    // const xmljs = require("xml-js");
    // const result = xmljs.xml2js(inputFile, { compact: true });

    // // Convert back to XML
    // const xml = xmljs.js2xml(result, { compact: true, spaces: 4 });
    // console.log(xml); // Converted back to XML

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
        outputLanguage = getLanguageCodeFromFilename(options.outputFilePath);
    }

    try {
        const outputJSON = await translate({
            apiKey: options.apiKey,
            batchSize: options.batchSize,
            chatParams: options.chatParams,
            engine: options.engine,
            ensureChangedTranslation: options.ensureChangedTranslation,
            host: options.host,
            inputJSON,
            inputLanguage,
            model: options.model,
            outputLanguage,
            overridePrompt: options.overridePrompt,
            rateLimitMs: options.rateLimitMs,
            skipStylingVerification: options.skipStylingVerification,
            skipTranslationVerification: options.skipTranslationVerification,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
        });

        const outputText = JSON.stringify(outputJSON, null, 4);
        fs.writeFileSync(options.outputFilePath, `${outputText}\n`);
    } catch (err) {
        console.error(`Failed to translate file to ${outputLanguage}: ${err}`);
    }
}

/**
 * Wraps translateDiff to take two versions of a source file and update
 * the target translation's file by only modifying keys that changed in the source
 * @param options - The file diff translation's options
 */
export async function translateFileDiff(
    options: TranslateFileDiffOptions,
): Promise<void> {
    // Get all the *json files from the same path as beforeInputPath
    const outputFilesOrPaths = fs
        .readdirSync(path.dirname(options.inputBeforeFileOrPath))
        .filter((file: string) => file.endsWith(".json"))
        .filter(
            (file) =>
                file !== path.basename(options.inputBeforeFileOrPath) &&
                file !== path.basename(options.inputAfterFileOrPath),
        )
        .map((file) =>
            path.resolve(path.dirname(options.inputBeforeFileOrPath), file),
        );

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
    for (const outputFileOrPath of outputFilesOrPaths) {
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
            apiKey: options.apiKey,
            batchSize: options.batchSize,
            chatParams: options.chatParams,
            engine: options.engine,
            ensureChangedTranslation: options.ensureChangedTranslation,
            host: options.host,
            inputJSONAfter: inputAfterJSON,
            inputJSONBefore: inputBeforeJSON,
            inputLanguage: options.inputLanguageCode,
            model: options.model,
            overridePrompt: options.overridePrompt,
            rateLimitMs: options.rateLimitMs,
            skipStylingVerification: options.skipStylingVerification,
            skipTranslationVerification: options.skipTranslationVerification,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            toUpdateJSONs,
            verbose: options.verbose,
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
}

/**
 * Wraps translate to take all keys of all files in a directory and re-create the exact
 * directory structure and translations for the target language
 * @param options - The directory translation's options
 */
export async function translateDirectory(
    options: TranslateDirectoryOptions,
): Promise<void> {
    const jsonFolder = path.resolve(process.cwd(), "jsons");
    let fullBasePath: string;
    if (path.isAbsolute(options.baseDirectory)) {
        fullBasePath = path.resolve(options.baseDirectory);
    } else {
        fullBasePath = path.resolve(jsonFolder, options.baseDirectory);
        if (!fs.existsSync(fullBasePath)) {
            fullBasePath = path.resolve(process.cwd(), options.baseDirectory);
        }
    }

    const sourceLanguagePath = path.resolve(
        fullBasePath,
        options.inputLanguage,
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
        const flatJSON = flatten(fileJSON, {
            delimiter: FLATTEN_DELIMITER,
        }) as {
            [key: string]: string;
        };

        for (const key in flatJSON) {
            if (Object.prototype.hasOwnProperty.call(flatJSON, key)) {
                inputJSON[
                    getTranslationDirectoryKey(
                        sourceFilePath,
                        key,
                        options.inputLanguage,
                        options.outputLanguage,
                    )
                ] = flatJSON[key];
            }
        }
    }

    const inputLanguage = getLanguageCodeFromFilename(options.inputLanguage);

    let outputLanguage = "";
    if (options.forceLanguageName) {
        outputLanguage = options.forceLanguageName;
    } else {
        outputLanguage = getLanguageCodeFromFilename(options.outputLanguage);
    }

    try {
        const outputJSON = (await translate({
            apiKey: options.apiKey,
            batchSize: options.batchSize,
            chatParams: options.chatParams,
            engine: options.engine,
            ensureChangedTranslation: options.ensureChangedTranslation,
            host: options.host,
            inputJSON,
            inputLanguage,
            model: options.model,
            outputLanguage,
            overridePrompt: options.overridePrompt,
            rateLimitMs: options.rateLimitMs,
            skipStylingVerification: options.skipStylingVerification,
            skipTranslationVerification: options.skipTranslationVerification,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
        })) as { [filePathKey: string]: string };

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
                    delimiter: FLATTEN_DELIMITER,
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
}

/**
 * Wraps translateDiff to take the changed keys of all files in a directory
 * and write the translation of those keys in the target translation
 * @param options - The directory translation diff's options
 */
export async function translateDirectoryDiff(
    options: TranslateDirectoryDiffOptions,
): Promise<void> {
    const jsonFolder = path.resolve(process.cwd(), "jsons");
    let fullBasePath: string;
    if (path.isAbsolute(options.baseDirectory)) {
        fullBasePath = path.resolve(options.baseDirectory);
    } else {
        fullBasePath = path.resolve(jsonFolder, options.baseDirectory);
        if (!fs.existsSync(fullBasePath)) {
            fullBasePath = path.resolve(process.cwd(), options.baseDirectory);
        }
    }

    const sourceLanguagePathBefore = path.resolve(
        fullBasePath,
        options.inputFolderNameBefore,
    );

    const sourceLanguagePathAfter = path.resolve(
        fullBasePath,
        options.inputFolderNameAfter,
    );

    if (!fs.existsSync(sourceLanguagePathBefore)) {
        throw new Error(
            `Source language path before does not exist. sourceLanguagePathBefore = ${sourceLanguagePathBefore}`,
        );
    }

    if (!fs.existsSync(sourceLanguagePathAfter)) {
        throw new Error(
            `Source language path after does not exist. sourceLanguagePathAfter = ${sourceLanguagePathAfter}`,
        );
    }

    // TODO: abstract to fn
    const sourceFilePathsBefore = getAllFilesInPath(sourceLanguagePathBefore);
    const inputJSONBefore: { [key: string]: string } = {};
    for (const sourceFilePath of sourceFilePathsBefore) {
        const fileContents = fs.readFileSync(sourceFilePath, "utf-8");
        const fileJSON = JSON.parse(fileContents);
        const flatJSON = flatten(fileJSON, {
            delimiter: FLATTEN_DELIMITER,
        }) as {
            [key: string]: string;
        };

        for (const key in flatJSON) {
            if (Object.prototype.hasOwnProperty.call(flatJSON, key)) {
                inputJSONBefore[
                    getTranslationDirectoryKey(
                        sourceFilePath,
                        key,
                        options.inputLanguageCode,
                    )
                ] = flatJSON[key];
            }
        }
    }

    const sourceFilePathsAfter = getAllFilesInPath(sourceLanguagePathAfter);
    const inputJSONAfter: { [key: string]: string } = {};
    for (const sourceFilePath of sourceFilePathsAfter) {
        const fileContents = fs.readFileSync(sourceFilePath, "utf-8");
        const fileJSON = JSON.parse(fileContents);
        const flatJSON = flatten(fileJSON, {
            delimiter: FLATTEN_DELIMITER,
        }) as {
            [key: string]: string;
        };

        for (const key in flatJSON) {
            if (Object.prototype.hasOwnProperty.call(flatJSON, key)) {
                inputJSONAfter[
                    getTranslationDirectoryKey(
                        sourceFilePath.replace(
                            options.inputFolderNameAfter,
                            options.inputFolderNameBefore,
                        ),
                        key,
                        options.inputLanguageCode,
                    )
                ] = flatJSON[key];
            }
        }
    }

    const outputLanguagePaths = fs
        .readdirSync(options.baseDirectory)
        .filter(
            (folder) =>
                folder !== path.basename(options.inputFolderNameBefore) &&
                folder !== path.basename(options.inputFolderNameAfter),
        )
        .map((folder) => path.resolve(options.baseDirectory, folder));

    const toUpdateJSONs: { [languageCode: string]: { [key: string]: string } } =
        {};

    for (const outputLanguagePath of outputLanguagePaths) {
        const files = getAllFilesInPath(outputLanguagePath);
        for (const file of files) {
            const fileContents = fs.readFileSync(file, "utf-8");
            const fileJSON = JSON.parse(fileContents);
            const flatJSON = flatten(fileJSON, {
                delimiter: FLATTEN_DELIMITER,
            }) as {
                [key: string]: string;
            };

            const relative = path.relative(
                options.baseDirectory,
                outputLanguagePath,
            );

            const segments = relative.split(path.sep).filter(Boolean);
            const language = segments[0];
            if (!toUpdateJSONs[language]) {
                toUpdateJSONs[language] = {};
            }

            for (const key in flatJSON) {
                if (Object.prototype.hasOwnProperty.call(flatJSON, key)) {
                    toUpdateJSONs[language][
                        getTranslationDirectoryKey(
                            file.replace(
                                outputLanguagePath,
                                options.inputFolderNameBefore,
                            ),
                            key,
                            options.inputLanguageCode,
                        )
                    ] = flatJSON[key];
                }
            }
        }
    }

    try {
        const perLanguageOutputJSON = await translateDiff({
            apiKey: options.apiKey,
            batchSize: options.batchSize,
            chatParams: options.chatParams,
            engine: options.engine,
            ensureChangedTranslation: options.ensureChangedTranslation,
            host: options.host,
            inputJSONAfter,
            inputJSONBefore,
            inputLanguage: options.inputLanguageCode,
            model: options.model,
            overridePrompt: options.overridePrompt,
            rateLimitMs: options.rateLimitMs,
            skipStylingVerification: options.skipStylingVerification,
            skipTranslationVerification: options.skipTranslationVerification,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            toUpdateJSONs,
            verbose: options.verbose,
        });

        const filesToJSON: { [filePath: string]: { [key: string]: string } } =
            {};

        for (const outputLanguage in perLanguageOutputJSON) {
            if (
                Object.prototype.hasOwnProperty.call(
                    perLanguageOutputJSON,
                    outputLanguage,
                )
            ) {
                const outputJSON = perLanguageOutputJSON[outputLanguage] as {
                    [key: string]: string;
                };

                for (const pathWithKey in outputJSON) {
                    if (
                        Object.prototype.hasOwnProperty.call(
                            outputJSON,
                            pathWithKey,
                        )
                    ) {
                        const filePath = pathWithKey
                            .split(":")
                            .slice(0, -1)
                            .join(":")
                            .replace(
                                options.inputFolderNameBefore,
                                `${options.baseDirectory}/${outputLanguage}`,
                            );

                        if (!filesToJSON[filePath]) {
                            filesToJSON[filePath] = {};
                        }

                        const key = pathWithKey.split(":").pop()!;
                        filesToJSON[filePath][key] = outputJSON[pathWithKey];
                    }
                }

                for (const perFileJSON in filesToJSON) {
                    if (
                        Object.prototype.hasOwnProperty.call(
                            filesToJSON,
                            perFileJSON,
                        )
                    ) {
                        const unflattenedOutput = unflatten(
                            filesToJSON[perFileJSON],
                            {
                                delimiter: FLATTEN_DELIMITER,
                            },
                        );

                        const outputText = JSON.stringify(
                            unflattenedOutput,
                            null,
                            4,
                        );

                        fs.mkdirSync(dirname(perFileJSON), { recursive: true });
                        fs.writeFileSync(perFileJSON, `${outputText}\n`);
                    }
                }
            }
        }
    } catch (err) {
        console.error(`Failed to translate directory diff: ${err}`);
    }

    // Remove any files in before not in after
    const fileNamesBefore = sourceFilePathsBefore.map((x) =>
        x.slice(sourceLanguagePathBefore.length),
    );

    const fileNamesAfter = sourceFilePathsAfter.map((x) =>
        x.slice(sourceLanguagePathAfter.length),
    );

    const removedFiles = fileNamesBefore.filter(
        (x) => !fileNamesAfter.includes(x),
    );

    for (const languagePath of outputLanguagePaths) {
        for (const removedFile of removedFiles) {
            const removedFilePath = languagePath + removedFile;
            fs.rmSync(removedFilePath);

            // Recursively cleanup parent folders if they're also empty
            let folder = path.dirname(removedFilePath);
            while (fs.readdirSync(folder).length === 0) {
                const parentFolder = path.resolve(folder, "..");
                fs.rmdirSync(folder);
                folder = parentFolder;
            }
        }
    }
}
