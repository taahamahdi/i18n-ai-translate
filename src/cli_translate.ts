import {
    CLI_HELP,
    DEFAULT_TEMPLATED_STRING_PREFIX,
    DEFAULT_TEMPLATED_STRING_SUFFIX,
} from "./constants";
import { Command } from "commander";
import {
    getAllLanguageCodes,
    getOutputPathFromInputPath,
    printError,
    printInfo,
    printWarn,
} from "./utils";
import { processModelArgs, processOverridePromptFile } from "./cli_helpers";
import { translateDirectory } from "./translate_directory";
import { translateFile } from "./translate_file";
import fs, { mkdtempSync } from "fs";
import path from "path";
import type DryRun from "./interfaces/dry_run";
import type OverridePrompt from "./interfaces/override_prompt";

/**
 * Builds the translate command for translating i18n files or directories.
 * @returns the translate command with its options and action.
 */
export default function buildTranslateCommand(): Command {
    return new Command("translate")
        .requiredOption(
            "-i, --input <input>",
            "Source i18n file or path of source language, in the jsons/ directory if a relative path is given",
        )
        .option(
            "-o, --output-languages [language codes...]",
            "A list of languages to translate to",
        )
        .requiredOption("-e, --engine <engine>", CLI_HELP.Engine)
        .option("-m, --model <model>", CLI_HELP.Model)
        .option("-r, --rate-limit-ms <rateLimitMs>", CLI_HELP.RateLimit)
        .option(
            "-f, --force-language-name <language name>",
            "Force output language name",
        )
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
        .option("-h, --host <hostIP:port>", CLI_HELP.OllamaHost)
        .option(
            "--ensure-changed-translation",
            CLI_HELP.EnsureChangedTranslation,
            false,
        )
        .option("-n, --batch-size <batchSize>", CLI_HELP.BatchSize)
        .option(
            "--skip-translation-verification",
            CLI_HELP.SkipTranslationVerification,
            false,
        )
        .option(
            "--skip-styling-verification",
            CLI_HELP.SkipStylingVerification,
            false,
        )
        .option(
            "--override-prompt <path to JSON file>",
            CLI_HELP.OverridePromptFile,
        )
        .option("--verbose", CLI_HELP.Verbose, false)
        .option("--prompt-mode <prompt-mode>", CLI_HELP.PromptMode)
        .option("--batch-max-tokens <batch-max-tokens>", CLI_HELP.MaxTokens)
        .option("--dry-run", CLI_HELP.DryRun, false)
        .action(async (options: any) => {
            const {
                model,
                chatParams,
                rateLimitMs,
                apiKey,
                host,
                promptMode,
                batchSize,
                batchMaxTokens,
            } = processModelArgs(options);

            let overridePrompt: OverridePrompt | undefined;
            if (options.overridePrompt) {
                overridePrompt = processOverridePromptFile(
                    options.overridePrompt,
                );
            }

            let dryRun: DryRun | undefined;
            if (options.dryRun) {
                dryRun = {
                    basePath: mkdtempSync(
                        `/tmp/i18n-ai-translate-${new Date().toISOString().replace(/[:.]/g, "-")}-`,
                    ),
                };
            }

            if (options.outputLanguages) {
                if (options.forceLanguageName) {
                    printError(
                        "Cannot use both --output-languages and --force-language",
                    );
                    return;
                }

                if (options.allLanguages) {
                    printError(
                        "Cannot use both --all-languages and --output-languages",
                    );
                    return;
                }

                if (options.outputLanguages.length === 0) {
                    printError("No languages specified");
                    return;
                }

                if (options.verbose) {
                    printInfo(
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
                        if (options.verbose) {
                            printInfo(
                                `Translating ${i}/${options.outputLanguages.length} languages...`,
                            );
                        }

                        const output = getOutputPathFromInputPath(
                            inputPath,
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
                                outputPath = path.resolve(
                                    process.cwd(),
                                    output,
                                );
                            }
                        }

                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await translateFile({
                                apiKey,
                                batchMaxTokens,
                                batchSize,
                                chatParams,
                                dryRun,
                                engine: options.engine,
                                ensureChangedTranslation:
                                    options.ensureChangedTranslation,
                                host,
                                inputFilePath: inputPath,
                                model,
                                outputFilePath: outputPath,
                                overridePrompt,
                                promptMode,
                                rateLimitMs,
                                skipStylingVerification:
                                    options.skipStylingVerification,
                                skipTranslationVerification:
                                    options.skipTranslationVerification,
                                templatedStringPrefix:
                                    options.templatedStringPrefix,
                                templatedStringSuffix:
                                    options.templatedStringSuffix,
                                verbose: options.verbose,
                            });
                        } catch (err) {
                            printError(
                                `Failed to translate file to ${languageCode}: ${err}`,
                            );
                        }
                    }
                } else {
                    let i = 0;
                    for (const languageCode of options.outputLanguages) {
                        i++;
                        if (options.verbose) {
                            printInfo(
                                `Translating ${i}/${options.outputLanguages.length} languages...`,
                            );
                        }

                        const output = getOutputPathFromInputPath(
                            inputPath,
                            languageCode,
                        );

                        if (options.input === output) {
                            continue;
                        }

                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await translateDirectory({
                                apiKey,
                                baseDirectory: path.resolve(inputPath, ".."),
                                batchMaxTokens: options.batchMaxTokens,
                                batchSize: options.batchSize,
                                chatParams,
                                dryRun,
                                engine: options.engine,
                                ensureChangedTranslation:
                                    options.ensureChangedTranslation,
                                host,
                                inputLanguage: path.basename(inputPath),
                                model,
                                outputLanguage: languageCode,
                                overridePrompt,
                                promptMode,
                                rateLimitMs,
                                skipStylingVerification:
                                    options.skipStylingVerification,
                                skipTranslationVerification:
                                    options.skipTranslationVerification,
                                templatedStringPrefix:
                                    options.templatedStringPrefix,
                                templatedStringSuffix:
                                    options.templatedStringSuffix,
                                verbose: options.verbose,
                            });
                        } catch (err) {
                            printError(
                                `Failed to translate directory to ${languageCode}: ${err}`,
                            );
                        }
                    }
                }
            } else {
                if (options.forceLanguageName) {
                    printError(
                        "Cannot use both --all-languages and --force-language",
                    );
                    return;
                }

                printWarn(
                    "Some languages may fail to translate due to the model's limitations",
                );

                let i = 0;
                for (const languageCode of getAllLanguageCodes()) {
                    i++;
                    if (options.verbose) {
                        printInfo(
                            `Translating ${i}/${getAllLanguageCodes().length} languages...`,
                        );
                    }

                    const jsonFolder = path.resolve(process.cwd(), "jsons");
                    let inputPath: string;
                    if (path.isAbsolute(options.input)) {
                        inputPath = path.resolve(options.input);
                    } else {
                        inputPath = path.resolve(jsonFolder, options.input);
                        if (!fs.existsSync(inputPath)) {
                            inputPath = path.resolve(
                                process.cwd(),
                                options.input,
                            );
                        }
                    }

                    if (fs.statSync(inputPath).isFile()) {
                        const output = getOutputPathFromInputPath(
                            inputPath,
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
                                outputPath = path.resolve(
                                    process.cwd(),
                                    output,
                                );
                            }
                        }

                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await translateFile({
                                apiKey,
                                batchMaxTokens: options.batchMaxTokens,
                                batchSize: options.batchSize,
                                chatParams,
                                dryRun,
                                engine: options.engine,
                                ensureChangedTranslation:
                                    options.ensureChangedTranslation,
                                host,
                                inputFilePath: inputPath,
                                model,
                                outputFilePath: outputPath,
                                overridePrompt,
                                promptMode,
                                rateLimitMs,
                                skipStylingVerification:
                                    options.skipStylingVerification,
                                skipTranslationVerification:
                                    options.skipTranslationVerification,
                                templatedStringPrefix:
                                    options.templatedStringPrefix,
                                templatedStringSuffix:
                                    options.templatedStringSuffix,
                                verbose: options.verbose,
                            });
                        } catch (err) {
                            printError(
                                `Failed to translate to ${languageCode}: ${err}`,
                            );
                        }
                    } else {
                        const output = getOutputPathFromInputPath(
                            inputPath,
                            languageCode,
                        );

                        if (options.input === output) {
                            continue;
                        }

                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await translateDirectory({
                                apiKey,
                                baseDirectory: path.resolve(inputPath, ".."),
                                batchMaxTokens: options.batchMaxTokens,
                                batchSize: options.batchSize,
                                chatParams,
                                dryRun,
                                engine: options.engine,
                                ensureChangedTranslation:
                                    options.ensureChangedTranslation,
                                host,
                                inputLanguage: path.basename(inputPath),
                                model,
                                outputLanguage: languageCode,
                                overridePrompt,
                                promptMode,
                                rateLimitMs,
                                skipStylingVerification:
                                    options.skipStylingVerification,
                                skipTranslationVerification:
                                    options.skipTranslationVerification,
                                templatedStringPrefix:
                                    options.templatedStringPrefix,
                                templatedStringSuffix:
                                    options.templatedStringSuffix,
                                verbose: options.verbose,
                            });
                        } catch (err) {
                            printError(
                                `Failed to translate directory to ${languageCode}: ${err}`,
                            );
                        }
                    }
                }
            }
        });
}
