import {
    CLI_HELP,
    DEFAULT_BATCH_SIZE,
    DEFAULT_MODEL,
    DEFAULT_TEMPLATED_STRING_PREFIX,
    DEFAULT_TEMPLATED_STRING_SUFFIX,
    VERSION,
} from "./constants";
import { config } from "dotenv";
import { getAllLanguageCodes, getLanguageCodeFromFilename } from "./utils";
import { program } from "commander";
import {
    translateDirectory,
    translateDirectoryDiff,
    translateFile,
    translateFileDiff,
} from "./translate";
import Engine from "./enums/engine";
import fs from "fs";
import path from "path";
import type { ChatParams, Model, ModelArgs } from "./types";

config({ path: path.resolve(process.cwd(), ".env") });

const processModelArgs = (options: any): ModelArgs => {
    let model: Model;
    let chatParams: ChatParams;
    let rateLimitMs = Number(options.rateLimitMs);
    let apiKey: string | undefined;
    let host: string | undefined;
    switch (options.engine) {
        case Engine.Gemini:
            model = options.model || DEFAULT_MODEL[Engine.Gemini];
            chatParams = {};
            if (!options.rateLimitMs) {
                // gemini-2.0-flash-exp limits us to 10 RPM => 1 call every 6 seconds
                rateLimitMs = 6000;
            }

            if (!process.env.GEMINI_API_KEY && !options.apiKey) {
                throw new Error("GEMINI_API_KEY not found in .env file");
            } else {
                apiKey = options.apiKey || process.env.GEMINI_API_KEY;
            }

            break;
        case Engine.ChatGPT:
            model = options.model || DEFAULT_MODEL[Engine.ChatGPT];
            chatParams = {
                messages: [],
                model,
                seed: 69420,
            };
            if (!options.rateLimitMs) {
                // Free-tier rate limits are 3 RPM => 1 call every 20 seconds
                // Tier 1 is a reasonable 500 RPM => 1 call every 120ms
                // TODO: token limits
                rateLimitMs = 120;
            }

            if (!process.env.OPENAI_API_KEY && !options.apiKey) {
                throw new Error("OPENAI_API_KEY not found in .env file");
            } else {
                apiKey = options.apiKey || process.env.OPENAI_API_KEY;
            }

            break;
        case Engine.Ollama:
            model = options.model || DEFAULT_MODEL[Engine.Ollama];
            chatParams = {
                messages: [],
                model,
                seed: 69420,
            };

            host = options.host || process.env.OLLAMA_HOSTNAME;

            break;
        case Engine.Claude:
            model = options.model || DEFAULT_MODEL[Engine.Claude];
            chatParams = {
                messages: [],
                model,
                seed: 69420,
            };

            if (!options.rateLimitMs) {
                // Anthropic limits us to 50 RPM on the first tier => 1200ms between calls
                rateLimitMs = 1200;
            }

            if (!process.env.ANTHROPIC_API_KEY && !options.apiKey) {
                throw new Error("ANTHROPIC_API_KEY not found in .env file");
            } else {
                apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
            }

            break;
        default: {
            throw new Error("Invalid engine");
        }
    }

    return {
        apiKey,
        chatParams,
        host,
        model: options.model || DEFAULT_MODEL[options.engine as Engine],
        rateLimitMs,
    };
};

program
    .name("i18n-ai-translate")
    .description(
        "Use ChatGPT, Gemini, Ollama, or Anthropic to translate your i18n JSON to any language",
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
    .option(
        "-n, --batch-size <batchSize>",
        CLI_HELP.BatchSize,
        String(DEFAULT_BATCH_SIZE),
    )
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
    .option("--verbose", CLI_HELP.Verbose, false)
    .action(async (options: any) => {
        const { model, chatParams, rateLimitMs, apiKey, host } =
            processModelArgs(options);

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
                    if (options.verbose) {
                        console.log(
                            `Translating ${i}/${options.outputLanguages.length} languages...`,
                        );
                    }

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
                            apiKey,
                            batchSize: options.batchSize,
                            chatParams,
                            engine: options.engine,
                            ensureChangedTranslation:
                                options.ensureChangedTranslation,
                            host,
                            inputFilePath: inputPath,
                            model,
                            outputFilePath: outputPath,
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
                        console.error(
                            `Failed to translate file to ${languageCode}: ${err}`,
                        );
                    }
                }
            } else {
                let i = 0;
                for (const languageCode of options.outputLanguages) {
                    i++;
                    if (options.verbose) {
                        console.log(
                            `Translating ${i}/${options.outputLanguages.length} languages...`,
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
                        await translateDirectory({
                            apiKey,
                            baseDirectory: path.resolve(inputPath, ".."),
                            batchSize: options.batchSize,
                            chatParams,
                            engine: options.engine,
                            ensureChangedTranslation:
                                options.ensureChangedTranslation,
                            host,
                            inputLanguage: path.basename(inputPath),
                            model,
                            outputLanguage: languageCode,
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
                        apiKey,
                        batchSize: options.batchSize,
                        chatParams,
                        engine: options.engine,
                        ensureChangedTranslation:
                            options.ensureChangedTranslation,
                        host,
                        inputFilePath: options.input,
                        model,
                        outputFilePath: output,
                        rateLimitMs,
                        skipStylingVerification:
                            options.skipStylingVerification,
                        skipTranslationVerification:
                            options.skipTranslationVerification,
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
        "-b, --before <fileOrDirectoryBefore>",
        "Source i18n file or directory before changes, in the jsons/ directory if a relative path is given",
    )
    .requiredOption(
        "-a, --after <fileOrDirectoryAfter>",
        "Source i18n file or directory after changes, in the jsons/ directory if a relative path is given",
    )
    .requiredOption(
        "-l, --input-language <inputLanguageCode>",
        "The input language's code, in ISO6391 (e.g. en, fr)",
    )
    .requiredOption("-e, --engine <engine>", CLI_HELP.Engine)
    .option("-m, --model <model>", CLI_HELP.Model)
    .option("-r, --rate-limit-ms <rateLimitMs>", CLI_HELP.RateLimit)
    .option("-k, --api-key <API key>", "API key")
    .option("-h, --host <hostIP:port>", CLI_HELP.OllamaHost)
    .option(
        "--ensure-changed-translation",
        CLI_HELP.EnsureChangedTranslation,
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
        CLI_HELP.BatchSize,
        String(DEFAULT_BATCH_SIZE),
    )
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
    .option("--verbose", CLI_HELP.Verbose, false)
    .action(async (options: any) => {
        const { model, chatParams, rateLimitMs, apiKey, host } =
            processModelArgs(options);

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

        if (
            fs.statSync(beforeInputPath).isFile() !==
            fs.statSync(afterInputPath).isFile()
        ) {
            console.error(
                "--before and --after arguments must be both files or both directories",
            );
            return;
        }

        if (fs.statSync(beforeInputPath).isFile()) {
            // Ensure they're in the same path
            if (
                path.dirname(beforeInputPath) !== path.dirname(afterInputPath)
            ) {
                console.error("Input files are not in the same directory");
                return;
            }

            await translateFileDiff({
                apiKey,
                batchSize: options.batchSize,
                chatParams,
                engine: options.engine,
                ensureChangedTranslation: options.ensureChangedTranslation,
                host,
                inputAfterFileOrPath: afterInputPath,
                inputBeforeFileOrPath: beforeInputPath,
                inputLanguageCode: options.inputLanguage,
                model,
                rateLimitMs,
                skipStylingVerification: options.skipStylingVerification,
                skipTranslationVerification:
                    options.skipTranslationVerification,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                verbose: options.verbose,
            });
        } else {
            await translateDirectoryDiff({
                apiKey,
                baseDirectory: path.resolve(beforeInputPath, ".."),
                batchSize: options.batchSize,
                chatParams,
                engine: options.engine,
                ensureChangedTranslation: options.ensureChangedTranslation,
                host,
                inputFolderNameAfter: afterInputPath,
                inputFolderNameBefore: beforeInputPath,
                inputLanguageCode: options.inputLanguage,
                model,
                rateLimitMs,
                skipStylingVerification: options.skipStylingVerification,
                skipTranslationVerification:
                    options.skipTranslationVerification,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
                verbose: options.verbose,
            });
        }
    });

program.parse();
