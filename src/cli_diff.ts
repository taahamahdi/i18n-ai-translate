import {
    CLI_HELP,
    DEFAULT_TEMPLATED_STRING_PREFIX,
    DEFAULT_TEMPLATED_STRING_SUFFIX,
} from "./constants";
import { Command } from "commander";
import { printError } from "./utils";
import { processModelArgs, processOverridePromptFile } from "./cli_helpers";
import { translateDirectoryDiff } from "./translate_directory";
import { translateFileDiff } from "./translate_file";
import fs from "fs";
import path from "path";
import type OverridePrompt from "./interfaces/override_prompt";

/**
 * Builds the diff command for comparing i18n files or directories.
 * @returns the diff command with its options and action.
 */
export default function buildDiffCommand(): Command {
    return new Command("diff")
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
                overridePrompt = processOverridePromptFile(
                    options.overridePrompt,
                );
            }

            const jsonFolder = path.resolve(process.cwd(), "jsons");
            let beforeInputPath: string;
            if (path.isAbsolute(options.before)) {
                beforeInputPath = path.resolve(options.before);
            } else {
                beforeInputPath = path.resolve(jsonFolder, options.before);
                if (!fs.existsSync(beforeInputPath)) {
                    beforeInputPath = path.resolve(
                        process.cwd(),
                        options.before,
                    );
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
                    path.dirname(beforeInputPath) !==
                    path.dirname(afterInputPath)
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
}
