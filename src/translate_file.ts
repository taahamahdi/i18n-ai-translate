import { createPatch, diffJson } from "diff";
import { getLanguageCodeFromFilename, printError } from "./utils";
import { translate, translateDiff } from "./translate";
import colors from "colors/safe";
import fs from "fs";
import path from "path";
import type TranslateFileDiffOptions from "./interfaces/translate_file_diff_options";
import type TranslateFileOptions from "./interfaces/translate_file_options";

/**
 * Wraps translate to take an input file and output its translation to another file
 * @param options - The file translation's options
 */
export async function translateFile(
    options: TranslateFileOptions,
): Promise<void> {
    let inputJSON = {};
    try {
        const inputFile = fs.readFileSync(options.inputFilePath, "utf-8");
        inputJSON = JSON.parse(inputFile);
    } catch (e) {
        printError(`Invalid input JSON: ${e}`);
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
            batchMaxTokens: options.batchMaxTokens,
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
            promptMode: options.promptMode,
            rateLimitMs: options.rateLimitMs,
            skipStylingVerification: options.skipStylingVerification,
            skipTranslationVerification: options.skipTranslationVerification,
            templatedStringPrefix: options.templatedStringPrefix,
            templatedStringSuffix: options.templatedStringSuffix,
            verbose: options.verbose,
        });

        const outputText = JSON.stringify(outputJSON, null, 4);
        if (!options.dryRun) {
            fs.writeFileSync(options.outputFilePath, `${outputText}\n`);
        } else {
            const translationDiff = diffJson(inputJSON, outputJSON);
            fs.writeFileSync(
                `${options.dryRun.basePath}/${path.basename(options.outputFilePath)}.new.json`,
                outputText,
            );

            const patch = createPatch(
                options.outputFilePath,
                JSON.stringify(inputJSON, null, 4),
                outputText,
            );

            fs.writeFileSync(
                `${options.dryRun.basePath}/${path.basename(options.outputFilePath)}.patch`,
                patch,
            );

            console.log(
                `Wrote new JSON to ${options.dryRun.basePath}/${path.basename(options.outputFilePath)}.new.json`,
            );

            console.log(
                `Wrote patch to ${options.dryRun.basePath}/${path.basename(options.outputFilePath)}.patch`,
            );
            if (options.verbose) {
                for (const part of translationDiff) {
                    const colorFns = {
                        green: colors.green,
                        grey: colors.grey,
                        red: colors.red,
                    } as const;

                    type ColorKey = keyof typeof colorFns;

                    let color: ColorKey;

                    if (part.added) {
                        color = "green";
                    } else if (part.removed) {
                        color = "red";
                    } else {
                        color = "grey";
                    }

                    process.stderr.write(colorFns[color](part.value));
                }
            }

            console.log();
        }
    } catch (err) {
        printError(`Failed to translate file to ${outputLanguage}: ${err}`);
        throw err;
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
        printError(`Invalid input JSON: ${e}`);
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
            printError(`Invalid output JSON: ${e}`);
        }
    }

    try {
        const outputJSON = await translateDiff({
            apiKey: options.apiKey,
            batchMaxTokens: options.batchMaxTokens,
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
            promptMode: options.promptMode,
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

                const inputJSON = toUpdateJSONs[language];
                const outputPath = languageCodeToOutputPath[language];

                if (!options.dryRun) {
                    fs.writeFileSync(outputPath, `${outputText}\n`);
                } else {
                    const translationDiff = diffJson(
                        inputJSON,
                        outputJSON[language],
                    );

                    fs.writeFileSync(
                        `${options.dryRun.basePath}/${path.basename(outputPath)}.new.json`,
                        outputText,
                    );

                    const patch = createPatch(
                        outputPath,
                        JSON.stringify(inputJSON, null, 4),
                        outputText,
                    );

                    fs.writeFileSync(
                        `${options.dryRun.basePath}/${path.basename(outputPath)}.patch`,
                        patch,
                    );

                    console.log(
                        `Wrote new JSON to ${options.dryRun.basePath}/${path.basename(outputPath)}.new.json`,
                    );

                    console.log(
                        `Wrote patch to ${options.dryRun.basePath}/${path.basename(outputPath)}.patch`,
                    );
                    if (options.verbose) {
                        for (const part of translationDiff) {
                            const colorFns = {
                                green: colors.green,
                                grey: colors.grey,
                                red: colors.red,
                            } as const;

                            type ColorKey = keyof typeof colorFns;

                            let color: ColorKey;

                            if (part.added) {
                                color = "green";
                            } else if (part.removed) {
                                color = "red";
                            } else {
                                color = "grey";
                            }

                            process.stderr.write(colorFns[color](part.value));
                        }

                        console.log();
                    }
                }
            }
        }
    } catch (err) {
        printError(`Failed to translate file diff: ${err}`);
        throw err;
    }
}
