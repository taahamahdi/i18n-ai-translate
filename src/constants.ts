import { OVERRIDE_PROMPT_KEYS } from "./interfaces/override_prompt";
import Engine from "./enums/engine";

export const DEFAULT_BATCH_SIZE = 16;
export const DEFAULT_REQUEST_TOKENS = 2048;
export const VERSION = "3.3.3";
export const DEFAULT_TEMPLATED_STRING_PREFIX = "{{";
export const DEFAULT_TEMPLATED_STRING_SUFFIX = "}}";
export const FLATTEN_DELIMITER = "*";
export const DEFAULT_MODEL = {
    [Engine.ChatGPT]: "gpt-4o",
    [Engine.Gemini]: "gemini-2.0-flash-exp",
    [Engine.Ollama]: "llama3.3",
    [Engine.Claude]: "claude-3-5-sonnet-latest",
};

export const CLI_HELP = {
    BatchSize:
        "How many keys to process at a time, 32 by default for chatgpt, 16 otherwise",
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

export const ANSIStyles = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    // Foreground Colors
    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        orange: "\x1b[38;5;214m",
    },

    // Background Colors
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        darkGray: "\x1b[48;5;240m",
        lightGray: "\x1b[48;5;245m",
    },
};
