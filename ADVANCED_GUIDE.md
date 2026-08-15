# `i18n-ai-translate`

Leverage ChatGPT, Gemini, Ollama, or Claude for seamless translation of localization files. Supports directories of nested translation files. [i18next-style](https://github.com/i18next/i18next) JSON is the default, with several other catalogue formats supported — see [File formats](#file-formats).

## Pipelines

### CSV Mode

Two prompts per batch: translate, then verify accuracy-and-styling together. Faster, but relies on the model following a precise line-per-line format — works well with GPT-class models, poorly with smaller ones.

1. The [translation prompt](#csv-translation-prompt) attempts a translation.
2. The [verification prompt](#csv-verification-prompt) uses a separate context to flag any accuracy or styling drift. (If you supply a custom `stylingVerificationPrompt` via `--override-prompt`, a second verify call runs; otherwise the merged verify is the only one.)

### JSON Mode

Structured-output translation using Zod schemas. Works with weaker models but is ~50% slower.

1. The [translation prompt](#json-translation-prompt) translates the whole batch and returns JSON validated against a Zod schema.
2. The [verification prompt](#json-verification-prompt) per-item verifies and fixes.

Chat history is retained across batches inside one worker so the model builds consistent terminology; parallel workers each have their own history.

### Parallelism

Batches run in parallel inside one language (`--concurrency`, default 2). Multiple target languages can run concurrently too (`--language-concurrency`, default 1). All workers share one `RateLimiter` — a 429 on any worker backs off every worker via `Retry-After`, and `--tokens-per-minute` enforces a cross-worker TPM cap when the provider's TPM tier is tighter than its RPM tier. Similar-valued strings are grouped and sharded across workers so each worker's chat history stays topically coherent.

### File formats

Every format goes through the same pipeline: an adapter parses the file into the flat `key → string` map the pipeline works on, and holds everything else — comments, ordering, metadata, native placeholder syntax — in a sidecar used to rebuild the file on write. Untouched entries come back byte-for-byte.

| `--file-format` | Extensions | Structure preserved | Placeholders normalized |
|---|---|---|---|
| `json` (default) | `.json` | Nesting, key order | `{{var}}` (native) |
| `po` | `.po` | Comments, `msgctxt`, plural forms, headers | `%s`, `%d`, `%1$s` |
| `properties` | `.properties` | Comments, separators, line continuations, escapes | `{0}`, `{1,date,short}` |
| `strings` | `.strings` | `/* */` and `//` comments, quoting, escapes | `%@`, `%1$@`, `%d` |
| `yaml` | `.yml`, `.yaml` | Comments, key order, quoting/block style | `%{name}`, `%<name>s` |
| `ts` | `.ts`, `.mts`, `.cts` | Imports, comments, types, `satisfies`/`as const` | `{{var}}` (native) |
| `js` | `.js`, `.mjs`, `.cjs` | Imports, comments, module shape | `{{var}}` (native) |
| `icu` | *(opt-in, no extension)* | Key order, non-string values, message structure | `{name}`, `{n, number, …}`, `#` |

The format is inferred from the file extension; pass `--file-format` to override. All formats work across `translate` (file and directory), `diff`, and `check`.

**ICU MessageFormat / next-intl.** Opt in with `--file-format icu`; it is deliberately *not* bound to `.json`, so existing i18next catalogues are unaffected. Arguments become `{{var}}` placeholders so the usual protection applies, and their original syntax — including number skeletons like `::currency/USD` — is restored verbatim on write. Rich-text tags such as `<link>…</link>` stay inline so the model translates a readable sentence.

Plural and select messages are expanded into one **whole sentence per branch**, not fragments: `You have {count, plural, one {# item} other {# items}} left` is translated as *"You have {{#}} item left"* and *"You have {{#}} items left"*. That gives the model full context, and lets a target language order words differently in each plural form. On write the branches are re-assembled against the **target** language's CLDR categories, so an English `one`/`other` source produces `one`/`few`/`many`/`other` for Russian. Exact matches like `=0` are carried across untouched.

Two limits worth knowing. Categories the source doesn't supply are filled from `other` — structurally valid but not correctly inflected, the same approximation the PO adapter makes; review those branches. And messages with nested or multiple plural/select blocks are passed through **untranslated** rather than risk mangling them. A rebuilt message that fails to re-parse is discarded in favour of the original, so a bad translation can never produce a catalogue that throws at runtime.

**JS/TS locale modules.** The catalogue is located as `export default {…}`, `export = {…}`, `module.exports = {…}`, an exported `const` holding an object literal, or — if the file has exactly one — a bare top-level `const`. Only plain string literals are translated, in whatever quote style they were written; numbers, template literals containing `${…}`, function calls, and computed keys are skipped and their bytes preserved. The exported binding is *not* renamed, so a `fr.ts` produced from `en.ts` still exports `enTranslations` if that is what the source called it.

**Rails YAML.** A locale-rooted file (`en:` as the single top-level key) has that root held out of the translation keys and retargeted to the output language on write, so `en.yml` → `fr.yml` comes back rooted at `fr:`. Files without a locale root are treated as a plain catalogue. Non-string scalars (numbers, booleans, dates) are left alone.

https://github.com/user-attachments/assets/4909bf01-3e7a-464a-9c6e-2d1b82cc47d0

- [Usage](#usage)
    - [Quick-start](#quick-start)
        - [GitHub Actions](#github-actions)
        - [Running directly](#running-directly)
        - [Running as a script in your own project](#running-as-a-script-in-your-own-project)
    - [Subcommands](#subcommands)
        - [`translate`](#translate)
        - [`diff`](#diff)
        - [`check`](#check)
    - [As a library](#as-a-library)
- [Concurrency & rate limits](#concurrency--rate-limits)
- [Prompt reference](#prompt-reference)
    - [CSV translation prompt](#csv-translation-prompt)
    - [CSV verification prompt](#csv-verification-prompt)
    - [JSON translation prompt](#json-translation-prompt)
    - [JSON verification prompt](#json-verification-prompt)
- [Prompt overriding](#prompt-overriding)
- [Dry-run mode](#dry-run-mode)

# Usage

## Quick-start

### GitHub Actions

Incorporate it into your CI with a [GitHub Action](https://github.com/marketplace/actions/i18n-ai-translate) to auto-translate keys for every pull request as a new commit. All configurable options available in [action.yml](https://github.com/taahamahdi/i18n-ai-translate/blob/master/action.yml).

The following translates every PR where `i18n/en.json` has been modified:

```yml
name: i18n-ai-translate

on:
    pull_request:
        # Only trigger when en.json has been modified
        paths:
            - "i18n/en.json"

jobs:
    build:
        runs-on: ubuntu-latest
        steps:
            - name: i18n-ai-translate
              uses: taahamahdi/i18n-ai-translate@master
              with:
                  json-file-path: i18n/en.json
                  api-key: ${{ secrets.OPENAI_API_KEY }}
```

### Running directly

```bash
git clone git@github.com:taahamahdi/i18n-ai-translate.git
cd i18n-ai-translate
yarn
cp /home/en.json jsons/

# Generate French translations
npm run i18n-ai-translate -- translate -i en.json -o fr --engine chatgpt --model gpt-5.2 --api-key <openai_key>
```

### Running as a script in your own project

```bash
yarn add i18n-ai-translate

# Generate French translations
npx i18n-ai-translate translate -i en.json -o fr --engine gemini --model gemini-2.5-flash --api-key <gemini_key>

# Or, assuming you already have other translations in the current directory
npx i18n-ai-translate diff --before en-before.json --after en.json --input-language en --engine claude --model claude-sonnet-4-6 --api-key <anthropic_key>
```

## Subcommands

Create a `.env` file with your API key, or pass `--api-key` (`-k`):

- `OPENAI_API_KEY=<your OpenAI API key>`
- `GEMINI_API_KEY=<your Gemini API key>`
- `ANTHROPIC_API_KEY=<your Anthropic API key>`

For Ollama, create an entry for your host, or use `--host` (`-h`) to set a custom host/port (defaults to `localhost:11434`):

- `OLLAMA_HOSTNAME=<the server and port number running Ollama>`

Relative input paths begin from the `jsons/` directory.

### `translate`

Converts a local i18n file (or a directory of them) into any target language.

```
Usage: i18n-ai-translate translate [options]

Options:
  -i, --input <input>                         Source i18n file or path of source language, in the jsons/ directory if a relative path is given
  -o, --output-languages [language codes...]  A list of languages to translate to
  -e, --engine <engine>                       Engine to use (chatgpt, gemini, ollama, or claude)
  -m, --model <model>                         Model to use (e.g. gpt-5.2, gemini-2.5-flash, llama3.3, claude-sonnet-4-6)
  -r, --rate-limit-ms <rateLimitMs>           How many milliseconds between requests (defaults to 1s for Gemini, 120ms (500 RPM) for ChatGPT, 1200ms for Claude)
  -f, --force-language-name <language name>   Force output language name
  -A, --all-languages                         Translate to all supported languages
  -p, --templated-string-prefix <prefix>      Prefix for templated strings (default: "{{")
  -s, --templated-string-suffix <suffix>      Suffix for templated strings (default: "}}")
  -k, --api-key <API key>                     API key
  -h, --host <hostIP:port>                    The host and port number serving Ollama (default port 11434)
  --ensure-changed-translation                Each generated translation key must differ from the input (for keys longer than 4)
  -n, --batch-size <batchSize>                How many keys to process at a time (32 for ChatGPT, 16 otherwise)
  --skip-translation-verification             Skip validating the resulting translation through another query
  --skip-styling-verification                 Skip validating the resulting translation's formatting through another query, only for 'csv' mode
  --override-prompt <path to JSON file>       Use the prompts from the given JSON file
  --verbose                                   Print logs about progress
  --prompt-mode <prompt-mode>                 'csv' (better performance, needs GPT-class) or 'json' (better compatibility, ~50% slower)
  --batch-max-tokens <batch-max-tokens>       Maximum token size of a single request (JSON mode only)
  --dry-run                                   Preview translations without writing; outputs go to /tmp
  --no-continue-on-error                      Abort on first key/batch failure (default: skip failures and report to stderr)
  --concurrency <concurrency>                 How many batches to run in parallel within one language (default: 2)
  --context <context>                         Product or domain context to steer translations
  --exclude-languages [language codes...]     Language codes to skip
  --tokens-per-minute <tpm>                   Cap tokens-per-minute across all concurrent workers (disabled by default)
  --language-concurrency <n>                  How many target languages to translate in parallel (default: 1)
  --file-format <format>                      json, po, properties, strings, yaml, ts, js, icu (default: inferred from extension)
  --cache [path]                              Reuse a translation memory across runs (default: .i18n-ai-translate-cache.json)
  --glossary <path>                           Path to a glossary JSON file steering terminology
  --help                                      display help for command
```

#### Examples

```bash
# Translate to French
npx i18n-ai-translate translate -i en.json -o fr

# Translate to three languages via Gemini
npx i18n-ai-translate translate -i en.json -o es de nl --engine gemini

# Translate to every supported language
npx i18n-ai-translate translate -i en.json -A --engine chatgpt --rate-limit-ms 150 -n 64

# Parallel fan-out: 4 concurrent languages × 4 batches each, with a TPM cap
npx i18n-ai-translate translate -i en.json -o fr es de it ja zh ko pt ru ar \
    --language-concurrency 4 --concurrency 4 --tokens-per-minute 150000

# Skip locales you maintain by hand
npx i18n-ai-translate translate -i en.json -A --exclude-languages fr de

# Domain context for better terminology
npx i18n-ai-translate translate -i en.json -o ja --context "a music trivia game for Discord"

# Preview without writing
npx i18n-ai-translate translate -i en.json -o fr --dry-run --verbose
```

### `diff`

Computes the difference between two versions of a source file (or directory) and applies the diff to every sibling target. **Untouched keys are preserved**, added/modified keys are re-translated, and deleted keys are removed. Each language is written to disk as soon as it finishes so a mid-run crash doesn't discard completed work.

```
Usage: i18n-ai-translate diff [options]

Options:
  -b, --before <fileOrDirectoryBefore>      Source i18n file or directory before changes
  -a, --after <fileOrDirectoryAfter>        Source i18n file or directory after changes
  -l, --input-language <inputLanguageCode>  The input language's code; ISO-639-1 (e.g. en, fr) or an English name like "English"
  -e, --engine <engine>                     Engine to use
  -m, --model <model>                       Model to use
  -r, --rate-limit-ms <rateLimitMs>         Gap between requests
  -k, --api-key <API key>                   API key
  -h, --host <hostIP:port>                  Ollama host:port
  --ensure-changed-translation              Force each translation to differ from the source
  -p, --templated-string-prefix <prefix>    Default "{{"
  -s, --templated-string-suffix <suffix>    Default "}}"
  -n, --batch-size <batchSize>              32 for ChatGPT, 16 otherwise
  --skip-translation-verification           Skip accuracy verify
  --skip-styling-verification               Skip styling verify (CSV mode only)
  --override-prompt <path to JSON file>     Custom prompts
  --verbose                                 Progress logs
  --prompt-mode <prompt-mode>               'csv' or 'json'
  --batch-max-tokens <batch-max-tokens>     JSON mode only
  --dry-run                                 Preview
  --no-continue-on-error                    Abort on first failure
  --concurrency <concurrency>               Parallel batches (default: 2)
  --context <context>                       Domain context
  --exclude-languages [language codes...]   Locales to skip
  --tokens-per-minute <tpm>                 TPM cap
  --file-format <format>                    json, po, properties, strings, yaml, ts, js, icu (default: from extension)
  --cache [path]                            Reuse a translation memory across runs
  --glossary <path>                         Glossary JSON file steering terminology
  --help                                    display help for command
```

#### Examples

```bash
# Apply en changes to every sibling JSON; supports BCP-47 filenames (es-ES, pt-BR, zh-CN)
npx i18n-ai-translate diff -b en.json -a en-after.json -l en --engine claude

# Directory diff with verbose logging via Ollama
npx i18n-ai-translate diff -b en -a en-after --engine ollama --host my-ollama:11434 --verbose

# Domain-aware diff
npx i18n-ai-translate diff -b en-before.json -a en.json -l en --engine chatgpt \
    --context "invoicing software for small businesses"
```

### `check`

Validates already-translated target files against the source without writing anything. Runs the verification-only path of the JSON pipeline and reports per-key issues.

```
Usage: i18n-ai-translate check [options]

Options:
  -i, --input <input>                         Source i18n file
  -o, --target-languages [language codes...]  Language codes to check; if omitted, every sibling locale file in the source's directory
  -e, --engine <engine>                       Engine to use
  -m, --model <model>                         Model to use
  -r, --rate-limit-ms <rateLimitMs>           Gap between requests
  -k, --api-key <API key>                     API key
  -h, --host <hostIP:port>                    Ollama host:port
  -p, --templated-string-prefix <prefix>      Default "{{"
  -s, --templated-string-suffix <suffix>      Default "}}"
  -n, --batch-size <batchSize>                32 for ChatGPT, 16 otherwise
  --override-prompt <path to JSON file>       Custom prompts
  --verbose                                   Progress logs
  --prompt-mode <prompt-mode>                 'csv' or 'json'
  --batch-max-tokens <batch-max-tokens>       JSON mode only
  --concurrency <concurrency>                 Parallel batches
  --context <context>                         Domain context
  --tokens-per-minute <tpm>                   TPM cap
  --format <format>                           'table' (default) or 'json'
  --file-format <format>                      json, po, properties, strings, yaml, ts, js, icu (default: from extension)
  --help                                      display help for command
```

Exit code is non-zero if any issue is reported, so you can gate CI on it.

#### Examples

```bash
# Report on every sibling locale, human-readable output
npx i18n-ai-translate check -i en.json

# JSON output suitable for CI parsing
npx i18n-ai-translate check -i en.json -o fr de ja --format json > audit.json
```

## As a library

Import `translate`, `translateDiff`, or `check` to drive the pipelines programmatically. See [`Options`](https://github.com/taahamahdi/i18n-ai-translate/blob/master/src/interfaces/options.ts) for the full shared shape.

```ts
import { translate, translateDiff, check } from "i18n-ai-translate";

const englishJSON = {
    welcomeMessage: "Welcome, {{name}}!",
    messages: {
        notifications_one: "You have one notification",
        notifications_other: "You have {{count}} notifications",
        delete: 'Would you like to delete the "{{name}}" category?',
    },
};

const frenchTranslation = await translate({
    apiKey: process.env.OPENAI_API_KEY,
    engine: "chatgpt",
    model: "gpt-5.2",
    inputJSON: englishJSON,
    inputLanguageCode: "en",
    outputLanguageCode: "fr",
    // All optional:
    context: "a music trivia game for Discord",
    concurrency: 4,
    tokensPerMinute: 150_000,
    continueOnError: true,
    promptMode: "json",
});

// Re-translate only changed keys across all sibling locales:
const diffed = await translateDiff({
    apiKey: process.env.ANTHROPIC_API_KEY,
    engine: "claude",
    model: "claude-sonnet-4-6",
    inputJSONBefore: require("./en-before.json"),
    inputJSONAfter: require("./en.json"),
    inputLanguageCode: "en",
    toUpdateJSONs: {
        fr: require("./fr.json"),
        de: require("./de.json"),
    },
    onLanguageComplete: (languageCode, translated) => {
        // Persist each language as soon as it finishes so a late crash
        // doesn't discard completed work.
        fs.writeFileSync(`./${languageCode}.json`, JSON.stringify(translated, null, 2));
    },
});

// Audit existing translations without writing
const report = await check({
    apiKey: process.env.OPENAI_API_KEY,
    engine: "chatgpt",
    model: "gpt-5.2",
    inputJSON: require("./en.json"),
    targetJSON: require("./fr.json"),
    inputLanguageCode: "en",
    outputLanguageCode: "fr",
});
// report.issues = [{ key, original, translated, issue, suggestion }]
if (report.issues.length > 0) {
    console.error("Translation drift detected:", report.issues);
    process.exit(1);
}
```

# Concurrency & rate limits

Two concurrency dials, one shared budget:

- **`--concurrency <n>`** (default 2) — batches run in parallel within a single language. Each worker holds its own chat history.
- **`--language-concurrency <n>`** (default 1) — target languages run in parallel. All languages share one `ChatPool` and one `RateLimiter`, so raising this does **not** multiply provider traffic.

The shared `RateLimiter` enforces:

- Per-request RPM via `--rate-limit-ms` (engine-specific default).
- Per-minute TPM via `--tokens-per-minute` (off by default; opt in using your provider's published tier limit).
- Automatic back-off across all workers when any worker receives a 429 (exponential with `Retry-After` honored).

**Suggested tunings:**

| Tier                           | `--concurrency` | `--language-concurrency` | `--tokens-per-minute` |
| ------------------------------ | --------------- | ------------------------ | --------------------- |
| Free / evaluation              | 1               | 1                        | 10000                 |
| OpenAI Tier-1                  | 4               | 4                        | 150000                |
| Anthropic Tier-1               | 2               | 2                        | 30000                 |
| Self-hosted Ollama             | 4-8             | 2-4                      | off                   |

# Prompt reference

All prompts are defined in English regardless of target language — this is intentional and research-backed (English scaffolding steers models more reliably than localized scaffolding). Expand ISO codes to language names before interpolation.

### CSV translation prompt

Batches of the input are passed in. Each output line is expected to be wrapped in ASCII quotes.

````
Product context: ${context}           ← only included when --context is supplied

You are a professional translator.

Translate each line from ${inputLanguage} to ${outputLanguage}.

Return translations in the same text formatting.

Maintain case sensitivity and whitespacing.

Output only the translations.

All lines should start and end with an ASCII quotation mark (").

```
${input}
```
````

### CSV verification prompt

The previous two-prompt chain (accuracy + styling) has been merged into a single rubric that flags NAK on any translation issue. The standalone styling prompt is only invoked when the user has supplied a `stylingVerificationPrompt` override, which saves a round-trip in the default case.

````
Product context: ${context}

You are a translation reviewer checking a ${inputLanguage}-to-${outputLanguage} batch in CSV form.

Reply with NAK if ANY translation has a problem, including:
- Inaccurate meaning, wrong tone, or grammar errors
- Mismatched capitalization, punctuation, or whitespace vs. the original
- Missing or extra placeholders, or altered variable names

Otherwise, reply with ACK.

Reply with ACK or NAK only — no explanation.

```
${inputLanguage},${outputLanguage}
${mergedCSV}
```
````

### JSON translation prompt

Batches use structured-output validation via Zod schemas.

````
Product context: ${context}

You are a professional translator.

Translate from ${inputLanguage} to ${outputLanguage}.

- Translate each object in the array.
- 'original' is the text to be translated.
- 'translated' must not be empty.
- 'context' is additional info if needed.
- 'failure' explains why the previous translation failed; use it to avoid repeating the same mistake.
- Preserve text formatting, case sensitivity, and whitespace. UI strings should stay close to the source length where possible.

Special Instructions:
- Treat anything in the format {{variableName}} as a placeholder. Never translate or modify its content. Do not convert {{NEWLINE}} to \n.
- Do not add variables that are not in the original.
- The number of variables must be the same in the translated text.
- Some keys end in CLDR plural suffixes (_zero, _one, _two, _few, _many, _other)...  ← only when plural keys are detected

Return the translation as JSON.
```json
${input}
```
````

### JSON verification prompt

Per-item verify with a schema returning `{ valid, issue, fixedTranslation }`. The prompt explicitly asks the model not to revise correct translations (a common failure mode).

````
Product context: ${context}

You are a professional translator.

Check translations from ${inputLanguage} to ${outputLanguage}.

- Verify each object in the array.
- 'original' is the text to be translated.
- 'translated' is the translated text.
- 'context' is additional info if needed.
- 'failure' explains why a prior translation failed; only populated during re-verification.
- Check for accuracy (meaning, tone, grammar) and formatting (case, whitespace, punctuation).

Do not revise correct translations. Flag only issues that meaningfully affect accuracy or readability.
If the translation is correct, return 'valid' as 'true' and leave 'fixedTranslation' and 'issue' empty.
If the translation is incorrect, return 'valid' as 'false', put the corrected translation in 'fixedTranslation', and explain the problem in 'issue'.

Special Instructions:
- Treat anything in the format {{variableName}} as a placeholder. Never translate or modify its content. Do not convert {{NEWLINE}} to \n.
- Do not add variables that are not in the original.
- The number of variables must be the same in the translated text.

Return the verified output as JSON.
```json
${input}
```
````

## Prompt overriding

Replace any built-in prompt with your own by creating a JSON file containing one or more of:

- `generationPrompt` — replaces the translation prompt for both CSV and JSON mode
- `translationVerificationPrompt` — replaces the verification prompt (CSV or JSON)
- `stylingVerificationPrompt` — CSV mode only; when supplied, re-enables the standalone styling pass

Pass the file path with `--override-prompt <path>`. Use `${inputLanguage}`, `${outputLanguage}`, `${context}`, and `${input}` (or `${mergedCSV}` for the CSV verification prompts) as template placeholders. Missing required placeholders throw at startup.

## Dry-run mode

Add the `--dry-run` flag on `translate` or `diff` to preview without writing. A directory is created in `/tmp/i18n-ai-translate-<timestamp>` with the full proposed output plus a `.patch` showing the diff against the existing file.
