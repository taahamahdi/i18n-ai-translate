import {
    CLI_HELP,
    DEFAULT_TEMPLATED_STRING_PREFIX,
    DEFAULT_TEMPLATED_STRING_SUFFIX,
} from "./constants";
import { Command } from "commander";
import { check } from "./check";
import {
    getLanguageCodeFromFilename,
    printError,
    printInfo,
    printWarn,
    resolveInputPath,
} from "./utils";
import { processModelArgs, processOverridePromptFile } from "./cli_helpers";
import ChatPool from "./chat_pool";
import RateLimiter from "./rate_limiter";
import fs from "fs";
import path from "path";
import type OverridePrompt from "./interfaces/override_prompt";

/**
 * Build the `check` subcommand: runs the verification pipeline against
 * existing translations without writing anything and prints a report.
 * Exits non-zero when any issue is reported so CI can gate on it.
 * @returns the commander Command
 */
export default function buildCheckCommand(): Command {
    return new Command("check")
        .requiredOption(
            "-i, --input <input>",
            "Source i18n file, in the jsons/ directory if a relative path is given",
        )
        .option(
            "-o, --target-languages [language codes...]",
            "Language codes to check; if omitted, every sibling JSON file in the source's directory is checked",
        )
        .requiredOption("-e, --engine <engine>", CLI_HELP.Engine)
        .option("-m, --model <model>", CLI_HELP.Model)
        .option("-r, --rate-limit-ms <rateLimitMs>", CLI_HELP.RateLimit)
        .option("-k, --api-key <API key>", "API key")
        .option("-h, --host <hostIP:port>", CLI_HELP.OllamaHost)
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
            "--override-prompt <path to JSON file>",
            CLI_HELP.OverridePromptFile,
        )
        .option("--verbose", CLI_HELP.Verbose, false)
        .option("--prompt-mode <prompt-mode>", CLI_HELP.PromptMode)
        .option("--batch-max-tokens <batch-max-tokens>", CLI_HELP.MaxTokens)
        .option("--concurrency <concurrency>", CLI_HELP.Concurrency)
        .option("--context <context>", CLI_HELP.Context)
        .option("--tokens-per-minute <tpm>", CLI_HELP.TokensPerMinute)
        .option(
            "--format <format>",
            "Output format: 'table' (default, human-readable) or 'json' (for CI consumption)",
            "table",
        )
        .action(async (options: any) => {
            const modelArgs = processModelArgs(options);

            // Share one pool + limiter across every target file we
            // check, so the RPM/TPM budgets are honoured across the
            // batch instead of being reset per target.
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

            let overridePrompt: OverridePrompt | undefined;
            if (options.overridePrompt) {
                overridePrompt = processOverridePromptFile(
                    options.overridePrompt,
                );
            }

            const inputPath = resolveInputPath(options.input);
            if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
                printError(`Source file not found: ${inputPath}`);
                process.exit(2);
            }

            const inputLanguageCode = getLanguageCodeFromFilename(inputPath);
            const sourceJSON = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

            // Determine which target files to check.
            const sourceDir = path.dirname(inputPath);
            const inputBase = path.basename(inputPath);

            let targetFiles: string[];
            if (options.targetLanguages && options.targetLanguages.length > 0) {
                targetFiles = options.targetLanguages.map((code: string) =>
                    path.join(sourceDir, `${code}.json`),
                );
            } else {
                targetFiles = fs
                    .readdirSync(sourceDir)
                    .filter((f) => f.endsWith(".json") && f !== inputBase)
                    .map((f) => path.join(sourceDir, f));
            }

            if (targetFiles.length === 0) {
                printWarn("No target files to check.");
                return;
            }

            const allReports = [];
            let hasIssues = false;

            for (const targetFile of targetFiles) {
                if (!fs.existsSync(targetFile)) {
                    printWarn(`Skipping missing target file: ${targetFile}`);
                    continue;
                }

                const outputLanguageCode = getLanguageCodeFromFilename(
                    path.basename(targetFile),
                );

                let targetJSON: Object;
                try {
                    targetJSON = JSON.parse(
                        fs.readFileSync(targetFile, "utf-8"),
                    );
                } catch (e) {
                    printError(
                        `Skipping invalid target JSON ${targetFile}: ${e}`,
                    );
                    continue;
                }

                if (options.verbose) {
                    printInfo(
                        `\nChecking ${outputLanguageCode} (${path.basename(targetFile)})...`,
                    );
                }

                // eslint-disable-next-line no-await-in-loop
                const report = await check({
                    ...modelArgs,
                    context: options.context,
                    engine: options.engine,
                    inputJSON: sourceJSON,
                    inputLanguageCode,
                    outputLanguageCode,
                    overridePrompt,
                    pool: sharedPool,
                    rateLimiter: sharedRateLimiter,
                    targetJSON,
                    templatedStringPrefix: options.templatedStringPrefix,
                    templatedStringSuffix: options.templatedStringSuffix,
                    verbose: options.verbose,
                });

                allReports.push(report);
                if (report.issues.length > 0) hasIssues = true;
            }

            if (options.format === "json") {
                // eslint-disable-next-line no-console
                console.log(JSON.stringify(allReports, null, 2));
            } else {
                for (const report of allReports) {
                    if (report.issues.length === 0) {
                        printInfo(
                            `\n${report.languageCode}: no issues found (${report.totalKeys} keys checked)`,
                        );
                        continue;
                    }

                    printError(
                        `\n${report.languageCode}: ${report.issues.length} issue(s) found`,
                    );
                    for (const issue of report.issues) {
                        printError(`  ${issue.key}:`);
                        printError(`    original:   ${issue.original}`);
                        printError(`    translated: ${issue.translated}`);
                        printError(`    issue:      ${issue.issue}`);
                        if (issue.suggestion) {
                            printError(`    suggestion: ${issue.suggestion}`);
                        }
                    }
                }
            }

            if (hasIssues) process.exit(1);
        });
}
