import {
    CLI_HELP,
    DEFAULT_MODEL,
    DEFAULT_TEMPLATED_STRING_PREFIX,
    DEFAULT_TEMPLATED_STRING_SUFFIX,
    VERSION,
} from "./constants";
import { OVERRIDE_PROMPT_KEYS } from "./interfaces/override_prompt";
import { config } from "dotenv";
import {
    getAllLanguageCodes,
    getLanguageCodeFromFilename,
    printError,
    printInfo,
    printWarn,
} from "./utils";
import { program } from "commander";
import {
    translateDirectory,
    translateDirectoryDiff,
    translateFile,
    translateFileDiff,
} from "./translate";
import Engine from "./enums/engine";
import PromptMode from "./enums/prompt_mode";
import fs from "fs";
import path from "path";
import type { ChatParams, Model, ModelArgs } from "./types";
import type OverridePrompt from "./interfaces/override_prompt";

config({ path: path.resolve(process.cwd(), ".env") });

const processModelArgs = (options: any): ModelArgs => {
    let model: Model;
    let chatParams: ChatParams;
    let rateLimitMs = Number(options.rateLimitMs);
    let apiKey: string | undefined;
    let host: string | undefined;
    let promptMode = options.promptMode as PromptMode;
    let batchSize = Number(options.batchSize);
    let batchMaxTokens = Number(options.batchMaxTokens);

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

            if (!options.promptMode) {
                promptMode = PromptMode.JSON;
            } else if (promptMode === PromptMode.CSV) {
                printWarn("JSON mode recommended for Gemini");
            }

            if (!options.batchSize) {
                batchSize = 32;
            }

            if (!options.batchMaxTokens) {
                batchMaxTokens = 4096;
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

            if (!options.promptMode) {
                promptMode = PromptMode.CSV;
            }

            if (!options.batchSize) {
                batchSize = 32;
            }

            if (!options.batchMaxTokens) {
                batchMaxTokens = 4096;
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

            if (!options.promptMode) {
                promptMode = PromptMode.JSON;
            } else if (promptMode === PromptMode.CSV) {
                printWarn("JSON mode recommended for Ollama");
            }

            if (!options.batchSize) {
                // Ollama's error rate is high with large batches
                batchSize = 16;
            }

            if (!options.batchMaxTokens) {
                // Ollama's default amount of tokens per request
                batchMaxTokens = 2048;
            }

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

            if (!options.promptMode) {
                promptMode = PromptMode.CSV;
            }

            if (!options.batchSize) {
                batchSize = 32;
            }

            break;
        default: {
            throw new Error("Invalid engine");
        }
    }

    switch (promptMode) {
        case PromptMode.CSV:
            if (options.batchMaxTokens) {
                throw new Error("'--batch-max-tokens' is not used in CSV mode");
            }

            break;
        case PromptMode.JSON:
            if (options.skipStylingVerification) {
                throw new Error(
                    "'--skip-styling-verification' is not used in JSON mode",
                );
            }

            if (options.engine === Engine.Claude) {
                throw new Error("JSON mode is not compatible with Anthropic");
            }

            break;
        default: {
            throw new Error("Invalid prompt mode");
        }
    }

    return {
        apiKey,
        batchMaxTokens,
        batchSize,
        chatParams,
        host,
        model: options.model || DEFAULT_MODEL[options.engine as Engine],
        promptMode,
        rateLimitMs,
    };
};

const processOverridePromptFile = (
    overridePromptFilePath: string,
): OverridePrompt => {
    const filePath = path.resolve(process.cwd(), overridePromptFilePath);
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `The override prompt file does not exist at ${filePath}`,
        );
    }

    let overridePrompt: OverridePrompt;
    try {
        overridePrompt = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (err) {
        throw new Error(
            `Failed to read the override prompt file. err = ${err}`,
        );
    }

    if (Object.keys(overridePrompt).length === 0) {
        throw new Error(
            `Received an empty object for the override prompt file. Valid keys are: ${OVERRIDE_PROMPT_KEYS.join(", ")}`,
        );
    }

    for (const key of Object.keys(overridePrompt) as (keyof OverridePrompt)[]) {
        if (!OVERRIDE_PROMPT_KEYS.includes(key)) {
            throw new Error(
                `Received an unexpected key ${key} in the override prompt file. Valid keys are: ${OVERRIDE_PROMPT_KEYS.join(", ")}`,
            );
        }
    }

    for (const value of Object.values(overridePrompt)) {
        if (typeof value !== "string") {
            throw new Error(
                `Expected a string as a key for every entry in the override prompt file. Received: ${typeof value}`,
            );
        }
    }

    return overridePrompt;
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
            overridePrompt = processOverridePromptFile(options.overridePrompt);
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
                            batchMaxTokens,
                            batchSize,
                            chatParams,
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
                            batchMaxTokens: options.batchMaxTokens,
                            batchSize: options.batchSize,
                            chatParams,
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
                        inputPath = path.resolve(process.cwd(), options.input);
                    }
                }

                if (fs.statSync(inputPath).isFile()) {
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
                            batchMaxTokens: options.batchMaxTokens,
                            batchSize: options.batchSize,
                            chatParams,
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
                            batchMaxTokens: options.batchMaxTokens,
                            batchSize: options.batchSize,
                            chatParams,
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
            overridePrompt = processOverridePromptFile(options.overridePrompt);
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

        if (
            fs.statSync(beforeInputPath).isFile() !==
            fs.statSync(afterInputPath).isFile()
        ) {
            printError(
                "--before and --after arguments must be both files or both directories",
            );
            return;
        }

        if (fs.statSync(beforeInputPath).isFile()) {
            // Ensure they're in the same path
            if (
                path.dirname(beforeInputPath) !== path.dirname(afterInputPath)
            ) {
                printError("Input files are not in the same directory");
                return;
            }

            await translateFileDiff({
                apiKey,
                batchMaxTokens,
                batchSize,
                chatParams,
                engine: options.engine,
                ensureChangedTranslation: options.ensureChangedTranslation,
                host,
                inputAfterFileOrPath: afterInputPath,
                inputBeforeFileOrPath: beforeInputPath,
                inputLanguageCode: options.inputLanguage,
                model,
                overridePrompt,
                promptMode,
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
                batchMaxTokens: options.batchMaxTokens,
                batchSize: options.batchSize,
                chatParams,
                engine: options.engine,
                ensureChangedTranslation: options.ensureChangedTranslation,
                host,
                inputFolderNameAfter: afterInputPath,
                inputFolderNameBefore: beforeInputPath,
                inputLanguageCode: options.inputLanguage,
                model,
                overridePrompt,
                promptMode,
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
