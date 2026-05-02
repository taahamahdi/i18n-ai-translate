import { DEFAULT_CONCURRENCY, DEFAULT_MODEL } from "./constants";
import { OVERRIDE_PROMPT_KEYS } from "./interfaces/override_prompt";
import { printWarn } from "./utils";
import Engine from "./enums/engine";
import PromptMode from "./enums/prompt_mode";
import fs from "fs";
import path from "path";
import type { ChatParams, Model, ModelArgs } from "./types";
import type OverridePrompt from "./interfaces/override_prompt";

/**
 * Processes the command line arguments to extract model parameters.
 * @param options - The command line options object.
 * @returns an object containing the model parameters.
 *
 */
export function processModelArgs(options: any): ModelArgs {
    let model: Model;
    let chatParams: ChatParams;
    let rateLimitMs = Number(options.rateLimitMs);
    let apiKey: string | undefined;
    let host: string | undefined;
    let promptMode = options.promptMode as PromptMode;
    let batchSize = Number(options.batchSize);
    let batchMaxTokens = Number(options.batchMaxTokens);
    let concurrency = Number(options.concurrency);
    if (!options.concurrency || !Number.isFinite(concurrency)) {
        concurrency = DEFAULT_CONCURRENCY;
    }

    if (!Number.isInteger(concurrency) || concurrency < 1) {
        throw new Error("--concurrency must be a positive integer");
    }

    // User-supplied --tokens-per-minute overrides the engine default.
    // 0 explicitly disables the cap; undefined defers to the per-engine
    // default assigned in the switch below.
    let tokensPerMinute: number | undefined;
    if (options.tokensPerMinute !== undefined) {
        const parsed = Number(options.tokensPerMinute);
        if (!Number.isFinite(parsed) || parsed < 0) {
            throw new Error("--tokens-per-minute must be a non-negative number");
        }

        tokensPerMinute = parsed === 0 ? undefined : parsed;
    }

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

            // No default TPM cap for Gemini — the existing --rate-limit-ms
            // default (6s, matching ~10 RPM free tier) already prevents
            // bursts. Paid-tier users can opt in via --tokens-per-minute.
            // Published Gemini 2.5 Flash paid tier is ~250k TPM; use that
            // as a user-facing hint in docs rather than a default.

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
                // Tier 1 is a reasonable 500 RPM => 1 call every 120ms.
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

            // No default TPM cap. The free tier publishes no TPM and
            // Tier-1 is ~200k TPM for GPT-5.x — a silent default risks
            // mysteriously throttling paid-tier users whose limits are
            // higher, while also risking undercounting on the free tier
            // where only the RPM gate matters. Users opt in via
            // --tokens-per-minute once they know their tier.

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

            // No default TPM cap. Claude's free tier is 5 RPM / 20k TPM;
            // Tier-1 is 50 RPM / 40k TPM; higher tiers go up from there.
            // The RPM gate (1200ms default) paces calls enough that most
            // users won't blow TPM without concurrency > 1. Opt in via
            // --tokens-per-minute 20000 on free tier, 40000 on Tier-1.

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
        concurrency,
        host,
        model: options.model || DEFAULT_MODEL[options.engine as Engine],
        promptMode,
        rateLimitMs,
        tokensPerMinute,
    };
}

/**
 * Processes the override prompt file.
 * @param overridePromptFilePath - The path to the override prompt file.
 * @returns an object containing the override prompt.
 */
export function processOverridePromptFile(
    overridePromptFilePath: string,
): OverridePrompt {
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
}
