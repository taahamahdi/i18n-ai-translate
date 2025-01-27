import Engine from "./enums/engine";

export const DEFAULT_BATCH_SIZE = 32;
export const VERSION = "3.3.2";
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
    BatchSize: "How many keys to process at a time",
    Engine: "Engine to use (chatgpt, gemini, ollama, or claude)",
    EnsureChangedTranslation:
        "Each generated translation key must differ from the input (for keys longer than 4)",
    Model: `Model to use (e.g. ${Object.values(DEFAULT_MODEL).join(", ")})`,
    OllamaHost:
        "The host and port number serving Ollama. 11434 is the default port number.",
    RateLimit:
        "How many milliseconds between requests (defaults to 1s for Gemini, 120ms (at 500RPM) for ChatGPT, 1200ms for Claude)",
    SkipStylingVerification:
        "Skip validating the resulting translation's formatting through another query",
    SkipTranslationVerification:
        "Skip validating the resulting translation through another query",
    Verbose: "Print logs about progress",
};
