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
    resolveInputPath,
    resolveOutputPath,
} from "./utils";
import { processModelArgs, processOverridePromptFile } from "./cli_helpers";
import { runWithConcurrency } from "./semaphore";
import { translateDirectory } from "./translate_directory";
import { translateFile } from "./translate_file";
import ChatPool from "./chat_pool";
import RateLimiter from "./rate_limiter";
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
        .option("--no-continue-on-error", CLI_HELP.NoContinueOnError)
        .option("--concurrency <concurrency>", CLI_HELP.Concurrency)
        .option("--context <context>", CLI_HELP.Context)
        .option(
            "--exclude-languages [language codes...]",
            CLI_HELP.ExcludeLanguages,
        )
        .option("--tokens-per-minute <tpm>", CLI_HELP.TokensPerMinute)
        .option("--language-concurrency <n>", CLI_HELP.LanguageConcurrency)
        .action(async (options: any) => {
            const modelArgs = processModelArgs(options);
            const languageConcurrency = Math.max(
                1,
                Number(options.languageConcurrency) || 1,
            );

            // Build a single pool + limiter up front. Every language
            // runs against these shared instances, so concurrent
            // languages share one RPM budget and one TPM cap — raising
            // --language-concurrency doesn't multiply provider traffic.
            const sharedRateLimiter = new RateLimiter(
                modelArgs.rateLimitMs,
                Boolean(options.verbose),
                modelArgs.tokensPerMinute,
            );

            const sharedPool = ChatPool.create({
                apiKey: modelArgs.apiKey,
                chatParams: modelArgs.chatParams,
                concurrency: Math.max(1, modelArgs.concurrency),
                engine: options.engine,
                host: modelArgs.host,
                model: modelArgs.model,
                rateLimiter: sharedRateLimiter,
            });

            // The commander options object carries CLI-only booleans that
            // processModelArgs doesn't re-expose; forward them by spreading
            // the subset the translate*() wrappers actually consume.
            const sharedOptions = {
                ...modelArgs,
                context: options.context,
                continueOnError: options.continueOnError,
                ensureChangedTranslation: options.ensureChangedTranslation,
                excludeLanguages: options.excludeLanguages,
                pool: sharedPool,
                rateLimiter: sharedRateLimiter,
                skipStylingVerification: options.skipStylingVerification,
                skipTranslationVerification:
                    options.skipTranslationVerification,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                verbose: options.verbose,
            };

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

                if (options.excludeLanguages) {
                    const excluded = new Set<string>(options.excludeLanguages);
                    options.outputLanguages = options.outputLanguages.filter(
                        (code: string) => !excluded.has(code),
                    );

                    if (options.outputLanguages.length === 0) {
                        printWarn(
                            "Every requested language was excluded; nothing to translate.",
                        );

                        return;
                    }
                }

                if (options.verbose) {
                    printInfo(
                        `Translating to ${options.outputLanguages.join(", ")}...`,
                    );
                }

                const inputPath = resolveInputPath(options.input);

                if (fs.statSync(inputPath).isFile()) {
                    await runWithConcurrency(
                        options.outputLanguages as string[],
                        languageConcurrency,
                        async (languageCode, idx) => {
                            if (options.verbose) {
                                printInfo(
                                    `Translating ${idx + 1}/${options.outputLanguages.length} languages...`,
                                );
                            }

                            const output = getOutputPathFromInputPath(
                                inputPath,
                                languageCode,
                            );

                            if (options.input === output) return;

                            const outputPath = resolveOutputPath(output);

                            try {
                                await translateFile({
                                    ...sharedOptions,
                                    dryRun,
                                    engine: options.engine,
                                    inputFilePath: inputPath,
                                    outputFilePath: outputPath,
                                    overridePrompt,
                                });
                            } catch (err) {
                                printError(
                                    `Failed to translate file to ${languageCode}: ${err}`,
                                );
                            }
                        },
                    );
                } else {
                    await runWithConcurrency(
                        options.outputLanguages as string[],
                        languageConcurrency,
                        async (languageCode, idx) => {
                            if (options.verbose) {
                                printInfo(
                                    `Translating ${idx + 1}/${options.outputLanguages.length} languages...`,
                                );
                            }

                            const output = getOutputPathFromInputPath(
                                inputPath,
                                languageCode,
                            );

                            if (options.input === output) return;

                            try {
                                await translateDirectory({
                                    ...sharedOptions,
                                    baseDirectory: path.resolve(
                                        inputPath,
                                        "..",
                                    ),
                                    dryRun,
                                    engine: options.engine,
                                    inputLanguageCode: path.basename(inputPath),
                                    outputLanguageCode: languageCode,
                                    overridePrompt,
                                });
                            } catch (err) {
                                printError(
                                    `Failed to translate directory to ${languageCode}: ${err}`,
                                );
                            }
                        },
                    );
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

                const excludedSet = new Set<string>(
                    options.excludeLanguages ?? [],
                );

                const allLanguages = getAllLanguageCodes().filter(
                    (code) => !excludedSet.has(code),
                );

                const inputPath = resolveInputPath(options.input);
                const isFile = fs.statSync(inputPath).isFile();

                await runWithConcurrency(
                    allLanguages,
                    languageConcurrency,
                    async (languageCode, idx) => {
                        if (options.verbose) {
                            printInfo(
                                `Translating ${idx + 1}/${allLanguages.length} languages...`,
                            );
                        }

                        const output = getOutputPathFromInputPath(
                            inputPath,
                            languageCode,
                        );

                        if (options.input === output) return;

                        if (isFile) {
                            const outputPath = resolveOutputPath(output);
                            try {
                                await translateFile({
                                    ...sharedOptions,
                                    dryRun,
                                    engine: options.engine,
                                    inputFilePath: inputPath,
                                    outputFilePath: outputPath,
                                    overridePrompt,
                                });
                            } catch (err) {
                                printError(
                                    `Failed to translate to ${languageCode}: ${err}`,
                                );
                            }
                        } else {
                            try {
                                await translateDirectory({
                                    ...sharedOptions,
                                    baseDirectory: path.resolve(
                                        inputPath,
                                        "..",
                                    ),
                                    dryRun,
                                    engine: options.engine,
                                    inputLanguageCode: path.basename(inputPath),
                                    outputLanguageCode: languageCode,
                                    overridePrompt,
                                });
                            } catch (err) {
                                printError(
                                    `Failed to translate directory to ${languageCode}: ${err}`,
                                );
                            }
                        }
                    },
                );
            }
        });
}
