import {
    CLI_HELP,
    DEFAULT_TEMPLATED_STRING_PREFIX,
    DEFAULT_TEMPLATED_STRING_SUFFIX,
} from "./constants";
import { Command } from "commander";
import { printError, resolveInputPath } from "./utils";
import { processModelArgs, processOverridePromptFile } from "./cli_helpers";
import { translateDirectoryDiff } from "./translate_directory";
import { translateFileDiff } from "./translate_file";
import fs, { mkdtempSync } from "fs";
import path from "path";
import type DryRun from "./interfaces/dry_run";
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
        .option("--dry-run", CLI_HELP.DryRun, false)
        .option("--no-continue-on-error", CLI_HELP.NoContinueOnError)
        .option("--concurrency <concurrency>", CLI_HELP.Concurrency)
        .option("--context <context>", CLI_HELP.Context)
        .action(async (options: any) => {
            const modelArgs = processModelArgs(options);
            const sharedOptions = {
                ...modelArgs,
                context: options.context,
                continueOnError: options.continueOnError,
                ensureChangedTranslation: options.ensureChangedTranslation,
                skipStylingVerification: options.skipStylingVerification,
                skipTranslationVerification: options.skipTranslationVerification,
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

            const beforeInputPath = resolveInputPath(options.before);
            const afterInputPath = resolveInputPath(options.after);

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
                    ...sharedOptions,
                    dryRun,
                    engine: options.engine,
                    inputAfterFileOrPath: afterInputPath,
                    inputBeforeFileOrPath: beforeInputPath,
                    inputLanguageCode: options.inputLanguage,
                    overridePrompt,
                });
            } else {
                await translateDirectoryDiff({
                    ...sharedOptions,
                    baseDirectory: path.resolve(beforeInputPath, ".."),
                    dryRun,
                    engine: options.engine,
                    inputFolderNameAfter: afterInputPath,
                    inputFolderNameBefore: beforeInputPath,
                    inputLanguageCode: options.inputLanguage,
                    overridePrompt,
                });
            }
        });
}
