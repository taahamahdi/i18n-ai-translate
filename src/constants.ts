import { OVERRIDE_PROMPT_KEYS } from "./interfaces/override_prompt";
import Engine from "./enums/engine";

export const DEFAULT_BATCH_SIZE = 32;
export const DEFAULT_REQUEST_TOKENS = 4096;
export const VERSION = "4.1.0";
export const DEFAULT_TEMPLATED_STRING_PREFIX = "{{";
export const DEFAULT_TEMPLATED_STRING_SUFFIX = "}}";
export const FLATTEN_DELIMITER = "*";
export const DEFAULT_MODEL = {
    [Engine.ChatGPT]: "gpt-4o",
    [Engine.Gemini]: "gemini-2.0-flash-exp",
    [Engine.Ollama]: "llama3.3",
    [Engine.Claude]: "claude-3-5-sonnet-latest",
};
export const RETRY_ATTEMPTS = 25;

export const CLI_HELP = {
    BatchSize:
        "How many keys to process at a time, 32 by default for chatgpt, 16 otherwise",
    DryRun: "Show the translations without writing to files, and store them in a temporary directory",
    Engine: "Engine to use (chatgpt, gemini, ollama, or claude)",
    EnsureChangedTranslation:
        "Each generated translation key must differ from the input (for keys longer than 4)",
    MaxTokens: "The maximum token size of a request",
    Model: `Model to use (e.g. ${Object.values(DEFAULT_MODEL).join(", ")})`,
    OllamaHost:
        "The host and port number serving Ollama. 11434 is the default port number.",
    OverridePromptFile: `Use the prompts from the given JSON file, containing keys for at least one of ${OVERRIDE_PROMPT_KEYS.join(", ")}`,
    PromptMode:
        "Chose the prompting mode, between 'csv' mode (better performance but will only work with advanced models like GPT-4o) or 'json' mode (compatible with less advanced models, like llama3.1:8b, but translations take 50% longer on average)",
    RateLimit:
        "How many milliseconds between requests (defaults to 1s for Gemini, 120ms (at 500RPM) for ChatGPT, 1200ms for Claude)",
    SkipStylingVerification:
        "Skip validating the resulting translation's formatting through another query, only for 'csv' mode",
    SkipTranslationVerification:
        "Skip validating the resulting translation through another query",
    Verbose: "Print logs about progress",
};
