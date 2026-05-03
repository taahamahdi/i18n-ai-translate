import { OVERRIDE_PROMPT_KEYS } from "./interfaces/override_prompt";
import { version as packageVersion } from "../package.json";
import Engine from "./enums/engine";

export const DEFAULT_BATCH_SIZE = 32;
export const DEFAULT_REQUEST_TOKENS = 4096;
export const VERSION = packageVersion;
export const DEFAULT_TEMPLATED_STRING_PREFIX = "{{";
export const DEFAULT_TEMPLATED_STRING_SUFFIX = "}}";
export const FLATTEN_DELIMITER = "*";
export const DEFAULT_MODEL = {
    [Engine.ChatGPT]: "gpt-5.2",
    [Engine.Gemini]: "gemini-2.5-flash",
    [Engine.Ollama]: "llama3.3",
    [Engine.Claude]: "claude-sonnet-4-6",
};
// 5 attempts with exponential backoff (1s, 2s, 4s, 8s, 16s base +
// jitter) gives ~30s of wall-clock retrying before a batch gives up,
// which is enough to ride out transient 429s without burning an hour
// on a genuinely bad key.
export const RETRY_ATTEMPTS = 5;
export const DEFAULT_CONCURRENCY = 2;

export const CLI_HELP = {
    BatchSize:
        "How many keys to process at a time, 32 by default for chatgpt, 16 otherwise",
    Concurrency:
        "How many batches to run in parallel (default: 2). Each worker holds its own chat history, sharing one rate limiter. Tune upward together with --rate-limit-ms to use more of your API tier",
    Context:
        "Product or domain context to steer translations (e.g. 'a music trivia game for Discord'). Injected into both the generation and verification prompts",
    ExcludeLanguages:
        "Language codes to skip (e.g. 'fr de'). Useful when some locales are maintained manually and shouldn't be machine-translated over",
    TokensPerMinute:
        "Cap on tokens-per-minute across all concurrent workers. Disabled by default — opt in with your provider's TPM limit to avoid burst-failing when your TPM tier is stricter than your RPM tier. Reference values: OpenAI Tier-1 ~200000, Anthropic Tier-1 40000 (free 20000), Gemini 2.5 Flash paid ~250000.",
    LanguageConcurrency:
        "How many target languages to translate in parallel (default 1). Each language shares the same pool and rate limiter, so raising this does not multiply provider traffic — pair with --concurrency and --tokens-per-minute to tune overall throughput.",
    DryRun: "Show the translations without writing to files, and store them in a temporary directory",
    Engine: "Engine to use (chatgpt, gemini, ollama, or claude)",
    EnsureChangedTranslation:
        "Each generated translation key must differ from the input (for keys longer than 4)",
    MaxTokens: "The maximum token size of a request",
    Model: `Model to use (e.g. ${Object.values(DEFAULT_MODEL).join(", ")})`,
    NoContinueOnError:
        "Abort the run when a key or batch exhausts retries (default: continue and report skipped keys to stderr)",
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
