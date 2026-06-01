import {
    DIRECTORY_KEY_DELIMITER,
    getAllFilesInPath,
    getTranslationDirectoryKey,
    getTranslationDirectoryPath,
    printError,
    printInfo,
    resolveInputPath,
} from "./utils";
import { FLATTEN_DELIMITER } from "./constants";
import { createPatch, diffJson } from "diff";
import { flatten } from "flat";
import { getAdapterByName, getAdapterForFile } from "./formats/registry";
import { translate, translateDiff } from "./translate";
import colors from "colors/safe";
import fs from "fs";
import path, { dirname } from "path";
import type FormatAdapter from "./formats/format_adapter";
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
    const fullBasePath = resolveInputPath(options.baseDirectory);

    const sourceLanguagePath = path.resolve(
        fullBasePath,
        options.inputLanguageCode,
    );

    if (!fs.existsSync(sourceLanguagePath)) {
        throw new Error(
            `Source language path does not exist. sourceLanguagePath = ${sourceLanguagePath}`,
        );
    }

    const sourceFilePaths = getAllFilesInPath(sourceLanguagePath);
    const inputJSON: { [key: string]: string } = {};
    // Per source file, remember the adapter that handled it and the
    // sidecar from its read, keyed by the *output* path that
    // getTranslationDirectoryKey embeds. The write loop recovers the
    // same path by splitting the compound key, then uses these to
    // reconstruct each file in its own format.
    const fileAdapters: {
        [outputPath: string]: {
            adapter: FormatAdapter<unknown>;
            sidecar: unknown;
        };
    } = {};

    for (const sourceFilePath of sourceFilePaths) {
        const adapter = options.format
            ? getAdapterByName(options.format)
            : getAdapterForFile(sourceFilePath);

        if (!adapter) {
            throw new Error(`Unknown format: ${options.format}`);
        }

        const { flat, sidecar } = adapter.read(
            fs.readFileSync(sourceFilePath, "utf-8"),
        );

        fileAdapters[
            getTranslationDirectoryPath(
                sourceFilePath,
                options.inputLanguageCode,
                options.outputLanguageCode,
            )
        ] = { adapter, sidecar };

        for (const key in flat) {
            if (Object.prototype.hasOwnProperty.call(flat, key)) {
                inputJSON[
                    getTranslationDirectoryKey(
                        sourceFilePath,
                        key,
                        options.inputLanguageCode,
                        options.outputLanguageCode,
                    )
                ] = flat[key];
            }
        }
    }

    const inputLanguage = options.inputLanguageCode;

    let outputLanguage = "";
    if (options.forceLanguageName) {
        outputLanguage = options.forceLanguageName;
    } else {
        outputLanguage = options.outputLanguageCode;
    }

    try {
        const outputJSON = (await translate({
            ...options,
            inputJSON,
            inputLanguageCode: inputLanguage,
            outputLanguageCode: outputLanguage,
        })) as { [filePathKey: string]: unknown };

        // Regroup the flat compound-keyed output back into per-file
        // objects. A value may be a nested object (JSON, which translate
        // re-nests on the FLATTEN_DELIMITER) or a string (formats whose
        // keys carry no delimiter); re-flattening below normalises both
        // back to each adapter's flat-map contract.
        const filesToObj: { [filePath: string]: { [key: string]: unknown } } =
            {};

        for (const pathWithKey in outputJSON) {
            if (Object.prototype.hasOwnProperty.call(outputJSON, pathWithKey)) {
                const filePath = pathWithKey
                    .split(DIRECTORY_KEY_DELIMITER)
                    .slice(0, -1)
                    .join(DIRECTORY_KEY_DELIMITER);

                if (!filesToObj[filePath]) {
                    filesToObj[filePath] = {};
                }

                const key = pathWithKey.split(DIRECTORY_KEY_DELIMITER).pop()!;
                filesToObj[filePath][key] = outputJSON[pathWithKey];
            }
        }

        for (const perFilePath in filesToObj) {
            if (
                !Object.prototype.hasOwnProperty.call(filesToObj, perFilePath)
            ) {
                continue;
            }

            const { adapter, sidecar } = fileAdapters[perFilePath];
            const perFileFlat = flatten(filesToObj[perFilePath], {
                delimiter: FLATTEN_DELIMITER,
            }) as { [key: string]: string };

            const outputText = adapter.write(
                perFileFlat,
                sidecar,
                inputLanguage,
                outputLanguage,
            );

            if (!options.dryRun) {
                fs.mkdirSync(dirname(perFilePath), { recursive: true });
                fs.writeFileSync(perFilePath, outputText);
            } else {
                // TODO: find a cleaner way to get the input file from here
                // Might lead to a bug if the path has the language code multiple times
                const relativeOutputPath = path.relative(
                    options.baseDirectory,
                    perFilePath,
                );

                const inputRaw = fs.readFileSync(
                    perFilePath.replace(
                        `/${outputLanguage}/`,
                        `/${inputLanguage}/`,
                    ),
                    "utf-8",
                );

                fs.mkdirSync(
                    dirname(`${options.dryRun.basePath}/${relativeOutputPath}`),
                    { recursive: true },
                );

                fs.writeFileSync(
                    `${options.dryRun.basePath}/${relativeOutputPath}`,
                    outputText,
                );

                const patch = createPatch(
                    perFilePath, // Use the absolute path for the patch header
                    inputRaw,
                    outputText,
                );

                fs.writeFileSync(
                    `${options.dryRun.basePath}/${relativeOutputPath}.patch`,
                    patch,
                );

                printInfo(
                    `Wrote new ${adapter.name} to ${options.dryRun.basePath}/${relativeOutputPath}`,
                );

                printInfo(
                    `Wrote patch to ${options.dryRun.basePath}/${relativeOutputPath}.patch`,
                );

                // The colored inline diff is JSON-aware; other adapters
                // still emit the patch file but skip the terminal diff.
                if (options.verbose && adapter.name === "json") {
                    const translationDiff = diffJson(inputRaw, outputText);
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
    const fullBasePath = resolveInputPath(options.baseDirectory);

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

    const resolveAdapter = (file: string): FormatAdapter<unknown> => {
        const adapter = options.format
            ? getAdapterByName(options.format)
            : getAdapterForFile(file);

        if (!adapter) {
            throw new Error(`Unknown format: ${options.format}`);
        }

        return adapter;
    };

    // TODO: abstract to fn
    const sourceFilePathsBefore = getAllFilesInPath(sourceLanguagePathBefore);
    const inputJSONBefore: { [key: string]: string } = {};
    for (const sourceFilePath of sourceFilePathsBefore) {
        const { flat } = resolveAdapter(sourceFilePath).read(
            fs.readFileSync(sourceFilePath, "utf-8"),
        );

        for (const key in flat) {
            if (Object.prototype.hasOwnProperty.call(flat, key)) {
                inputJSONBefore[
                    getTranslationDirectoryKey(
                        sourceFilePath,
                        key,
                        options.inputLanguageCode,
                    )
                ] = flat[key];
            }
        }
    }

    // The *after* catalogue is what every target file is rebuilt from,
    // so keep each file's adapter + sidecar keyed by the before-folder
    // path that the compound keys carry (writeLanguageOutput recovers
    // the same path by splitting the key).
    const fileAdapters: {
        [beforePath: string]: {
            adapter: FormatAdapter<unknown>;
            sidecar: unknown;
        };
    } = {};

    const sourceFilePathsAfter = getAllFilesInPath(sourceLanguagePathAfter);
    const inputJSONAfter: { [key: string]: string } = {};
    for (const sourceFilePath of sourceFilePathsAfter) {
        const adapter = resolveAdapter(sourceFilePath);
        const { flat, sidecar } = adapter.read(
            fs.readFileSync(sourceFilePath, "utf-8"),
        );

        const beforeEquivalentPath = sourceFilePath.replace(
            options.inputFolderNameAfter,
            options.inputFolderNameBefore,
        );

        fileAdapters[
            getTranslationDirectoryPath(
                beforeEquivalentPath,
                options.inputLanguageCode,
            )
        ] = { adapter, sidecar };

        for (const key in flat) {
            if (Object.prototype.hasOwnProperty.call(flat, key)) {
                inputJSONAfter[
                    getTranslationDirectoryKey(
                        beforeEquivalentPath,
                        key,
                        options.inputLanguageCode,
                    )
                ] = flat[key];
            }
        }
    }

    const excludeSet = new Set<string>(options.excludeLanguages ?? []);
    const outputLanguagePaths = fs
        .readdirSync(options.baseDirectory)
        .filter(
            (folder) =>
                folder !== path.basename(options.inputFolderNameBefore) &&
                folder !== path.basename(options.inputFolderNameAfter),
        )
        .filter((folder) => !excludeSet.has(folder))
        .map((folder) => path.resolve(options.baseDirectory, folder));

    const toUpdateJSONs: { [languageCode: string]: { [key: string]: string } } =
        {};

    for (const outputLanguagePath of outputLanguagePaths) {
        const files = getAllFilesInPath(outputLanguagePath);
        for (const file of files) {
            const adapter = resolveAdapter(file);
            const raw = fs.readFileSync(file, "utf-8");
            // Existing target translations: read msgstr-style slots when
            // the format separates source from target, else fall back.
            const flat = adapter.readTranslated
                ? adapter.readTranslated(raw).flat
                : adapter.read(raw).flat;

            const relative = path.relative(
                options.baseDirectory,
                outputLanguagePath,
            );

            const segments = relative.split(path.sep).filter(Boolean);
            const language = segments[0];
            if (!toUpdateJSONs[language]) {
                toUpdateJSONs[language] = {};
            }

            for (const key in flat) {
                if (Object.prototype.hasOwnProperty.call(flat, key)) {
                    toUpdateJSONs[language][
                        getTranslationDirectoryKey(
                            `${fullBasePath}/${file.replace(
                                outputLanguagePath,
                                options.inputFolderNameBefore,
                            )}`,
                            key,
                            options.inputLanguageCode,
                        )
                    ] = flat[key];
                }
            }
        }
    }

    const inputLanguage = options.inputLanguageCode;

    // Split one language's flat `filepath:key → value` map into per-file
    // flat maps, then write each file. The same code path serves the
    // non-dry-run write case and the dry-run patch-emission case.
    const writeLanguageOutput = (
        outputLanguage: string,
        flatOutputJSON: { [key: string]: string },
    ): void => {
        const beforeBaseName = path.basename(
            path.resolve(options.baseDirectory, options.inputFolderNameBefore),
        );

        // Regroup the flat compound-keyed output per source file. In diff
        // mode translateDiff re-flattens, so each value is already a
        // string keyed by the adapter's own flat key — no per-file
        // unflatten is needed before handing it back to the adapter.
        const filesToFlat: {
            [beforePath: string]: { [key: string]: string };
        } = {};

        for (const pathWithKey in flatOutputJSON) {
            if (
                !Object.prototype.hasOwnProperty.call(
                    flatOutputJSON,
                    pathWithKey,
                )
            ) {
                continue;
            }

            const beforePath = pathWithKey
                .split(DIRECTORY_KEY_DELIMITER)
                .slice(0, -1)
                .join(DIRECTORY_KEY_DELIMITER);

            if (!filesToFlat[beforePath]) filesToFlat[beforePath] = {};
            const key = pathWithKey.split(DIRECTORY_KEY_DELIMITER).pop()!;
            filesToFlat[beforePath][key] = flatOutputJSON[pathWithKey];
        }

        for (const beforePath in filesToFlat) {
            if (!Object.prototype.hasOwnProperty.call(filesToFlat, beforePath)) {
                continue;
            }

            const meta = fileAdapters[beforePath];
            if (!meta) continue;

            const outputFilePath = beforePath.replace(
                `/${beforeBaseName}/`,
                `/${outputLanguage}/`,
            );

            const outputText = meta.adapter.write(
                filesToFlat[beforePath],
                meta.sidecar,
                inputLanguage,
                outputLanguage,
            );

            if (!options.dryRun) {
                fs.mkdirSync(dirname(outputFilePath), { recursive: true });
                fs.writeFileSync(outputFilePath, outputText);
            } else {
                const relativeOutputPath = path.relative(
                    options.baseDirectory,
                    outputFilePath,
                );

                const rawBefore = fs.existsSync(outputFilePath)
                    ? fs.readFileSync(outputFilePath, "utf-8")
                    : "";

                fs.mkdirSync(
                    dirname(`${options.dryRun.basePath}/${relativeOutputPath}`),
                    { recursive: true },
                );

                fs.writeFileSync(
                    `${options.dryRun.basePath}/${relativeOutputPath}`,
                    outputText,
                );

                const patch = createPatch(
                    outputFilePath, // Use the absolute path for the patch header
                    rawBefore,
                    outputText,
                );

                fs.writeFileSync(
                    `${options.dryRun.basePath}/${relativeOutputPath}.patch`,
                    patch,
                );

                printInfo(
                    `Wrote new ${meta.adapter.name} to ${options.dryRun.basePath}/${relativeOutputPath}`,
                );

                printInfo(
                    `Wrote patch to ${options.dryRun.basePath}/${relativeOutputPath}.patch`,
                );

                // Colored inline diff is JSON-aware; other adapters still
                // emit the patch file but skip the terminal diff.
                if (
                    options.verbose &&
                    meta.adapter.name === "json" &&
                    rawBefore
                ) {
                    const translationDiff = diffJson(rawBefore, outputText);
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
            }

            console.log();
        }
    };

    try {
        await translateDiff({
            ...options,
            inputJSONAfter,
            inputJSONBefore,
            inputLanguageCode: inputLanguage,
            // Persist each language as it finishes so a later crash
            // doesn't discard earlier work. Dry-run still emits its
            // patches here — the emission is still streaming, but each
            // dry-run language's patches land together.
            onLanguageComplete: (outputLanguage, _unflattened, flat) =>
                writeLanguageOutput(outputLanguage, flat),
            toUpdateJSONs,
        });
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
