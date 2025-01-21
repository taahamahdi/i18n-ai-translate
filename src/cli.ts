import {
    DEFAULT_BATCH_SIZE,
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
import type { ChatParams, Model } from "./types";

config({ path: path.resolve(process.cwd(), ".env") });

program
    .name("i18n-ai-translate")
    .description(
        "Use ChatGPT, Gemini, or Ollama to translate your i18n JSON to any language",
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
    .requiredOption(
        "-e, --engine <engine>",
        "Engine to use (chatgpt, gemini, or ollama)",
    )
    .option(
        "-m, --model <model>",
        "Model to use (e.g. gpt-o1, gpt-4o, gpt-4-turbo, gpt-3.5-turbo, gemini-pro, llama3.3, phi4)",
    )
    .option(
        "-r, --rate-limit-ms <rateLimitMs>",
        "How many milliseconds between requests (defaults to 1s for Gemini, 120ms (at 500RPM) for ChatGPT)",
    )
    .option("-f, --force-language-name <language name>", "Force language name")
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
    .option(
        "-h, --host <hostIP:port>",
        "The host and port number serving Ollama. 11434 is the default port number.",
    )
    .option(
        "--ensure-changed-translation",
        "Each generated translation key must differ from the input (for keys longer than 4)",
        false,
    )
    .option(
        "-n, --batch-size <batchSize>",
        "How many keys to process at a time",
        String(DEFAULT_BATCH_SIZE),
    )
    .option(
        "--skip-translation-verification",
        "Skip validating the resulting translation through another query",
        false,
    )
    .option(
        "--skip-styling-verification",
        "Skip validating the resulting translation's formatting through another query",
        false,
    )
    .option("--verbose", "Print logs about progress", false)
    .action(async (options: any) => {
        let model: Model;
        let chatParams: ChatParams;
        let rateLimitMs = Number(options.rateLimitMs);
        let apiKey: string | undefined;
        let host: string | undefined;
        switch (options.engine) {
            case Engine.Gemini:
                model = options.model || "gemini-pro";
                chatParams = {};
                if (!options.rateLimitMs) {
                    rateLimitMs = 1000;
                }

                if (!process.env.GEMINI_API_KEY && !options.apiKey) {
                    console.error("GEMINI_API_KEY not found in .env file");
                    return;
                } else {
                    apiKey = options.apiKey || process.env.GEMINI_API_KEY;
                }

                break;
            case Engine.ChatGPT:
                model = options.model || "gpt-4o";
                chatParams = {
                    messages: [],
                    model,
                    seed: 69420,
                };
                if (!options.rateLimitMs) {
                    rateLimitMs = 120;
                }

                if (!process.env.OPENAI_API_KEY && !options.apiKey) {
                    console.error("OPENAI_API_KEY not found in .env file");
                    return;
                } else {
                    apiKey = options.apiKey || process.env.OPENAI_API_KEY;
                }

                break;
            case Engine.Ollama:
                model = options.model || "llama3.3";
                chatParams = {
                    messages: [],
                    model,
                    seed: 69420,
                };

                if (!process.env.OLLAMA_HOSTNAME && !options.host) {
                    console.error("OLLAMA_HOSTNAME not found in .env file");
                    return;
                } else {
                    host = options.host || process.env.OLLAMA_HOSTNAME;
                }

                break;
            default:
                console.error("Invalid engine");
                return;
        }

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
                    console.log(
                        `Translating ${i}/${options.outputLanguages.length} languages...`,
                    );
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
                    console.log(
                        `Translating ${i}/${options.outputLanguages.length} languages...`,
                    );
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
    .requiredOption(
        "-e, --engine <engine>",
        "Engine to use (chatgpt, gemini, or ollama)",
    )
    .option(
        "-m, --model <model>",
        "Model to use (e.g. gpt-4o, gpt-4-turbo, gpt-4, gpt-3.5-turbo, gemini-pro, llama3.3, phi4)",
    )
    .option(
        "-r, --rate-limit-ms <rateLimitMs>",
        "How many milliseconds between requests (defaults to 1s for Gemini, 120ms (at 500RPM) for ChatGPT)",
    )
    .option("-k, --api-key <API key>", "API key")
    .option(
        "-h, --host <hostIP:port>",
        "The host and port number serving Ollama. 11434 is the default port number.",
    )
    .option(
        "--ensure-changed-translation",
        "Each generated translation key must differ from the input (for keys longer than 4)",
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
        "How many keys to process at a time",
        String(DEFAULT_BATCH_SIZE),
    )
    .option(
        "--skip-translation-verification",
        "Skip validating the resulting translation through another query",
        false,
    )
    .option(
        "--skip-styling-verification",
        "Skip validating the resulting translation's formatting through another query",
        false,
    )
    .option("--verbose", "Print logs about progress", false)
    .action(async (options: any) => {
        let model: Model;
        let chatParams: ChatParams;
        let rateLimitMs = Number(options.rateLimitMs);
        let apiKey: string | undefined;
        let host: string | undefined;
        switch (options.engine) {
            case Engine.Gemini:
                model = options.model || "gemini-pro";
                chatParams = {};
                if (!options.rateLimitMs) {
                    rateLimitMs = 1000;
                }

                if (!process.env.GEMINI_API_KEY && !options.apiKey) {
                    console.error("GEMINI_API_KEY not found in .env file");
                    return;
                } else {
                    apiKey = options.apiKey || process.env.GEMINI_API_KEY;
                }

                break;
            case Engine.ChatGPT:
                model = options.model || "gpt-4o";
                chatParams = {
                    messages: [],
                    model,
                    seed: 69420,
                };
                if (!options.rateLimitMs) {
                    rateLimitMs = 120;
                }

                if (!process.env.OPENAI_API_KEY && !options.apiKey) {
                    console.error("OPENAI_API_KEY not found in .env file");
                    return;
                } else {
                    apiKey = options.apiKey || process.env.OPENAI_API_KEY;
                }

                break;
            case Engine.Ollama:
                model = options.model || "llama3.3";
                chatParams = {
                    messages: [],
                    model,
                    seed: 69420,
                };

                if (!process.env.OLLAMA_HOSTNAME && !options.host) {
                    console.error("OLLAMA_HOSTNAME not found in .env file");
                    return;
                } else {
                    host = options.host || process.env.OLLAMA_HOSTNAME;
                }

                break;
            default:
                console.error("Invalid engine");
                return;
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
