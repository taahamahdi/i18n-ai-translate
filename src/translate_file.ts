import { createPatch, diffJson } from "diff";
import {
    getLanguageCodeFromFilename,
    isValidLanguageCode,
    printError,
    printInfo,
    printWarn,
    resolveInputPath,
} from "./utils";
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
            ...options,
            inputJSON,
            inputLanguageCode: inputLanguage,
            outputLanguageCode: outputLanguage,
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

            printInfo(
                `Wrote new JSON to ${options.dryRun.basePath}/${path.basename(options.outputFilePath)}.new.json`,
            );

            printInfo(
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

    const inputBeforePath = resolveInputPath(options.inputBeforeFileOrPath);
    const inputAfterPath = resolveInputPath(options.inputAfterFileOrPath);

    const outputPaths = outputFilesOrPaths.map(resolveInputPath);

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
    // Validate every target locale up front so a bad code fails fast
    // before the first API call, instead of aborting mid-batch after
    // some locales have already incurred cost.
    const invalidTargets: string[] = [];
    for (const outputPath of outputPaths) {
        const languageCode = getLanguageCodeFromFilename(
            path.basename(outputPath),
        );

        if (!languageCode || !isValidLanguageCode(languageCode)) {
            invalidTargets.push(path.basename(outputPath));
            continue;
        }

        try {
            const outputFile = fs.readFileSync(outputPath, "utf-8");
            toUpdateJSONs[languageCode] = JSON.parse(outputFile);
            languageCodeToOutputPath[languageCode] = outputPath;
        } catch (e) {
            printError(`Invalid output JSON: ${e}`);
        }
    }

    if (invalidTargets.length > 0) {
        printWarn(
            `Skipping ${invalidTargets.length} file(s) with unrecognised language codes: ${invalidTargets.join(", ")}`,
        );
    }

    try {
        const outputJSON = await translateDiff({
            ...options,
            inputJSONAfter: inputAfterJSON,
            inputJSONBefore: inputBeforeJSON,
            // Persist each locale as soon as it finishes so a crash
            // later in the run doesn't discard already-translated work.
            // Dry-run output is still emitted below in aggregate.
            onLanguageComplete: options.dryRun
                ? undefined
                : (languageCode, translated) => {
                      const outputPath =
                          languageCodeToOutputPath[languageCode];
                      if (!outputPath) return;
                      const text = JSON.stringify(translated, null, 4);
                      fs.writeFileSync(outputPath, `${text}\n`);
                  },
            toUpdateJSONs,
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
                    // Already persisted in onLanguageComplete above.
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

                    printInfo(
                        `Wrote new JSON to ${options.dryRun.basePath}/${path.basename(outputPath)}.new.json`,
                    );

                    printInfo(
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
