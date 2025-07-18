import { FLATTEN_DELIMITER } from "./constants";
import { createPatch, diffJson } from "diff";
import { flatten, unflatten } from "flat";
import {
    getAllFilesInPath,
    getTranslationDirectoryKey,
    printError,
} from "./utils";
import { translate, translateDiff } from "./translate";
import colors from "colors/safe";
import fs from "fs";
import path, { dirname } from "path";
import type TranslateDirectoryDiffOptions from "./interfaces/translate_directory_diff_options";
import type TranslateDirectoryOptions from "./interfaces/translate_directory_options";

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

    const inputLanguage = options.inputLanguage;

    let outputLanguage = "";
    if (options.forceLanguageName) {
        outputLanguage = options.forceLanguageName;
    } else {
        outputLanguage = options.outputLanguage;
    }

    try {
        const outputJSON = (await translate({
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
                if (!options.dryRun) {
                    fs.mkdirSync(dirname(perFileJSON), { recursive: true });
                    fs.writeFileSync(perFileJSON, `${outputText}\n`);
                } else {
                    // TODO: find a cleaner way to get the input file from here
                    // Might lead to a bug if the path has the language code multiple times
                    const relativeOutputPath = path.relative(
                        options.baseDirectory,
                        perFileJSON,
                    );

                    const input = fs.readFileSync(
                        perFileJSON.replace(
                            `/${outputLanguage}/`,
                            `/${inputLanguage}/`,
                        ),
                        "utf-8",
                    );

                    const translationDiff = diffJson(input, outputText);
                    fs.mkdirSync(
                        dirname(
                            `${options.dryRun.basePath}/${relativeOutputPath}`,
                        ),
                        { recursive: true },
                    );

                    fs.writeFileSync(
                        `${options.dryRun.basePath}/${relativeOutputPath}`,
                        outputText,
                    );

                    const patch = createPatch(
                        perFileJSON, // Use the absolute path for the patch header
                        input,
                        outputText,
                    );

                    fs.writeFileSync(
                        `${options.dryRun.basePath}/${relativeOutputPath}.patch`,
                        patch,
                    );

                    console.log(
                        `Wrote new JSON to ${options.dryRun.basePath}/${relativeOutputPath}`,
                    );

                    console.log(
                        `Wrote patch to ${options.dryRun.basePath}/${relativeOutputPath}.patch`,
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
            }
        }
    } catch (err) {
        printError(
            `Failed to translate directory to ${outputLanguage}: ${err}`,
        );
        throw err;
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
                            `${fullBasePath}/${file.replace(
                                outputLanguagePath,
                                options.inputFolderNameBefore,
                            )}`,
                            key,
                            options.inputLanguageCode,
                        )
                    ] = flatJSON[key];
                }
            }
        }
    }

    const inputLanguage = options.inputLanguageCode;

    try {
        const perLanguageOutputJSON = await translateDiff({
            apiKey: options.apiKey,
            batchMaxTokens: options.batchMaxTokens,
            batchSize: options.batchSize,
            chatParams: options.chatParams,
            engine: options.engine,
            ensureChangedTranslation: options.ensureChangedTranslation,
            host: options.host,
            inputJSONAfter,
            inputJSONBefore,
            inputLanguage,
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

        for (const outputLanguage in perLanguageOutputJSON) {
            if (
                Object.prototype.hasOwnProperty.call(
                    perLanguageOutputJSON,
                    outputLanguage,
                )
            ) {
                const filesToJSON: {
                    [filePath: string]: { [key: string]: string };
                } = {};

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
                        const beforeBaseName = path.basename(
                            path.resolve(
                                options.baseDirectory,
                                options.inputFolderNameBefore,
                            ),
                        );

                        const filePath = pathWithKey
                            .split(":")
                            .slice(0, -1)
                            .join(":")
                            .replace(
                                `/${beforeBaseName}/`,
                                `/${outputLanguage}/`,
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

                        if (!options.dryRun) {
                            fs.mkdirSync(dirname(perFileJSON), {
                                recursive: true,
                            });
                            fs.writeFileSync(perFileJSON, `${outputText}\n`);
                        } else {
                            // TODO: find a cleaner way to get the input file from here
                            // Might lead to a bug if the path has the language code multiple times
                            const relativeOutputPath = path.relative(
                                options.baseDirectory,
                                perFileJSON.replace(
                                    `/${inputLanguage}/`,
                                    `/${outputLanguage}/`,
                                ),
                            );

                            const input = fs.readFileSync(perFileJSON, "utf-8");
                            const translationDiff = diffJson(input, outputText);
                            fs.mkdirSync(
                                dirname(
                                    `${options.dryRun.basePath}/${relativeOutputPath}`,
                                ),
                                { recursive: true },
                            );

                            fs.writeFileSync(
                                `${options.dryRun.basePath}/${relativeOutputPath}`,
                                outputText,
                            );

                            const patch = createPatch(
                                perFileJSON.replace(
                                    `/${inputLanguage}/`,
                                    `/${outputLanguage}/`,
                                ), // Use the absolute path for the patch header
                                input,
                                outputText,
                            );

                            fs.writeFileSync(
                                `${options.dryRun.basePath}/${relativeOutputPath}.patch`,
                                patch,
                            );

                            console.log(
                                `Wrote new JSON to ${options.dryRun.basePath}/${relativeOutputPath}`,
                            );

                            console.log(
                                `Wrote patch to ${options.dryRun.basePath}/${relativeOutputPath}.patch`,
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

                                    process.stderr.write(
                                        colorFns[color](part.value),
                                    );
                                }
                            }
                        }

                        console.log();
                    }
                }
            }
        }
    } catch (err) {
        printError(`Failed to translate directory diff: ${err}`);
        throw err;
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
