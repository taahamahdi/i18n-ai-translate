import { FLATTEN_DELIMITER } from "./constants";
import { createPatch, diffJson } from "diff";
import { flatten, unflatten } from "flat";
import {
    getAdapterByName,
    getAdapterForFile,
} from "./formats/registry";
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
    const adapter = options.format
        ? getAdapterByName(options.format)
        : getAdapterForFile(options.inputFilePath);

    if (!adapter) {
        printError(`Unknown format: ${options.format}`);
        return;
    }

    let rawInput: string;
    try {
        rawInput = fs.readFileSync(options.inputFilePath, "utf-8");
    } catch (e) {
        printError(`Failed to read input file: ${e}`);
        return;
    }

    let flatInput: Record<string, string>;
    let sidecar: unknown;
    try {
        ({ flat: flatInput, sidecar } = adapter.read(rawInput));
    } catch (e) {
        printError(`Invalid input (${adapter.name}): ${e}`);
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
            inputJSON: flatInput,
            inputLanguageCode: inputLanguage,
            outputLanguageCode: outputLanguage,
        });

        // translate() returns an unflattened object; the adapter
        // contract takes a flat map. Re-flattening is cheap and keeps
        // the adapter agnostic of the pipeline's internal shape.
        const flatOutput = flatten(outputJSON, {
            delimiter: FLATTEN_DELIMITER,
        }) as Record<string, string>;

        const outputText = adapter.write(
            flatOutput,
            sidecar,
            inputLanguage,
            outputLanguage,
        );

        if (!options.dryRun) {
            fs.writeFileSync(options.outputFilePath, outputText);
        } else {
            fs.writeFileSync(
                `${options.dryRun.basePath}/${path.basename(options.outputFilePath)}.new.${adapter.name}`,
                outputText,
            );

            const patch = createPatch(
                options.outputFilePath,
                rawInput,
                outputText,
            );

            fs.writeFileSync(
                `${options.dryRun.basePath}/${path.basename(options.outputFilePath)}.patch`,
                patch,
            );

            printInfo(
                `Wrote new ${adapter.name} to ${options.dryRun.basePath}/${path.basename(options.outputFilePath)}.new.${adapter.name}`,
            );

            printInfo(
                `Wrote patch to ${options.dryRun.basePath}/${path.basename(options.outputFilePath)}.patch`,
            );

            // Colored inline diff is JSON-aware today; future adapters
            // can bring their own formatter if this limits them.
            if (options.verbose && adapter.name === "json") {
                const unflattenedOutput = unflatten(flatOutput, {
                    delimiter: FLATTEN_DELIMITER,
                }) as object;

                const translationDiff = diffJson(
                    JSON.parse(rawInput),
                    unflattenedOutput,
                );

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
    const adapter = options.format
        ? getAdapterByName(options.format)
        : getAdapterForFile(options.inputBeforeFileOrPath);

    if (!adapter) {
        printError(`Unknown format: ${options.format}`);
        return;
    }

    // Sibling target files share the source's format/extension.
    const excludeSet = new Set<string>(options.excludeLanguages ?? []);
    const outputFilesOrPaths = fs
        .readdirSync(path.dirname(options.inputBeforeFileOrPath))
        .filter((file: string) =>
            adapter.extensions.some((ext) =>
                file.toLowerCase().endsWith(ext.toLowerCase()),
            ),
        )
        .filter(
            (file) =>
                file !== path.basename(options.inputBeforeFileOrPath) &&
                file !== path.basename(options.inputAfterFileOrPath),
        )
        .filter((file) => {
            // Filter by extracted language code; accept either the
            // full filename or just the code in --exclude-languages.
            if (excludeSet.size === 0) return true;
            const code = getLanguageCodeFromFilename(file);
            return !excludeSet.has(code) && !excludeSet.has(file);
        })
        .map((file) =>
            path.resolve(path.dirname(options.inputBeforeFileOrPath), file),
        );

    const inputBeforePath = resolveInputPath(options.inputBeforeFileOrPath);
    const inputAfterPath = resolveInputPath(options.inputAfterFileOrPath);

    const outputPaths = outputFilesOrPaths.map(resolveInputPath);

    // Read both source revisions through the adapter. The *after*
    // sidecar is the catalogue we rebuild every target file from, so it
    // carries the current comments/structure/headers.
    let inputBeforeFlat: Record<string, string>;
    let inputAfterFlat: Record<string, string>;
    let afterSidecar: unknown;
    try {
        inputBeforeFlat = adapter.read(
            fs.readFileSync(inputBeforePath, "utf-8"),
        ).flat;
        const afterRead = adapter.read(
            fs.readFileSync(inputAfterPath, "utf-8"),
        );

        inputAfterFlat = afterRead.flat;
        afterSidecar = afterRead.sidecar;
    } catch (e) {
        printError(`Invalid input (${adapter.name}): ${e}`);
        return;
    }

    // Existing target files are read with readTranslated when the format
    // distinguishes source from target (PO: msgstr vs msgid); formats
    // that don't (JSON) fall back to read.
    const readTarget = (raw: string): Record<string, string> =>
        adapter.readTranslated
            ? adapter.readTranslated(raw).flat
            : adapter.read(raw).flat;

    const toUpdateJSONs: { [language: string]: Object } = {};
    const languageCodeToOutputPath: { [language: string]: string } = {};
    // Raw target contents retained for dry-run patch/diff "before" text.
    const rawTargetByLanguage: { [language: string]: string } = {};
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
            const raw = fs.readFileSync(outputPath, "utf-8");
            toUpdateJSONs[languageCode] = readTarget(raw);
            languageCodeToOutputPath[languageCode] = outputPath;
            rawTargetByLanguage[languageCode] = raw;
        } catch (e) {
            printError(`Invalid output (${adapter.name}): ${e}`);
        }
    }

    if (invalidTargets.length > 0) {
        printWarn(
            `Skipping ${invalidTargets.length} file(s) with unrecognised language codes: ${invalidTargets.join(", ")}`,
        );
    }

    // Write (or, for dry-run, emit artifacts for) one finished language.
    const writeTarget = (
        languageCode: string,
        flatMap: Record<string, string>,
    ): void => {
        const outputPath = languageCodeToOutputPath[languageCode];
        if (!outputPath) return;

        const outputText = adapter.write(
            flatMap,
            afterSidecar,
            options.inputLanguageCode,
            languageCode,
        );

        if (!options.dryRun) {
            fs.writeFileSync(outputPath, outputText);
            return;
        }

        const rawBefore = rawTargetByLanguage[languageCode] ?? "";

        fs.writeFileSync(
            `${options.dryRun.basePath}/${path.basename(outputPath)}.new.${adapter.name}`,
            outputText,
        );

        const patch = createPatch(outputPath, rawBefore, outputText);
        fs.writeFileSync(
            `${options.dryRun.basePath}/${path.basename(outputPath)}.patch`,
            patch,
        );

        printInfo(
            `Wrote new ${adapter.name} to ${options.dryRun.basePath}/${path.basename(outputPath)}.new.${adapter.name}`,
        );

        printInfo(
            `Wrote patch to ${options.dryRun.basePath}/${path.basename(outputPath)}.patch`,
        );

        if (options.verbose && adapter.name === "json") {
            const translationDiff = diffJson(
                rawBefore ? JSON.parse(rawBefore) : {},
                unflatten(flatMap, { delimiter: FLATTEN_DELIMITER }) as object,
            );

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
    };

    try {
        const outputJSON = await translateDiff({
            ...options,
            inputJSONAfter: inputAfterFlat,
            inputJSONBefore: inputBeforeFlat,
            // Persist each locale as soon as it finishes so a crash
            // later in the run doesn't discard already-translated work.
            // Dry-run output is emitted below in aggregate instead.
            onLanguageComplete: options.dryRun
                ? undefined
                : (languageCode, _unflattened, flat) =>
                      writeTarget(languageCode, flat),
            toUpdateJSONs,
        });

        if (options.dryRun) {
            for (const language in outputJSON) {
                if (
                    Object.prototype.hasOwnProperty.call(outputJSON, language)
                ) {
                    const flatMap = flatten(outputJSON[language], {
                        delimiter: FLATTEN_DELIMITER,
                    }) as Record<string, string>;

                    writeTarget(language, flatMap);
                }
            }
        }
    } catch (err) {
        printError(`Failed to translate file diff: ${err}`);
        throw err;
    }
}
