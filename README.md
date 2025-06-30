# `i18n-ai-translate`

Leverage ChatGPT, Gemini, Ollama, or Claude for seamless translation of localization files. Supports directories of nested translation files. Requires [i18next-style](https://github.com/i18next/i18next) JSON files.

##### CSV Mode

Three prompts are chained to ensure each translation is well-formed.

1. The [translation prompt](#translation-prompt) attempts a translation
2. The [translation verification prompt](#translation-verification-prompt) uses a separate context to verify the translation
3. The [styling verification prompt](#styling-verification-prompt) uses yet another context to verify the translation's formatting is consistent with the source

##### JSON Mode

Translation and verification is done in two separate steps.

1. The [translation prompt](#translation-prompt-json) attempts to translate the whole file
2. The [translation verification prompt](#translation-verification-prompt-json) verifies/fixes and verifies again each line.

History is retained between calls to ensure consistency when translating the entire file.

https://github.com/user-attachments/assets/4909bf01-3e7a-464a-9c6e-2d1b82cc47d0

- [Usage](#usage)
    - [Quick-start](#quick-start)
        - [GitHub Actions](#github-actions)
        - [Running directly](#running-directly)
        - [Running as a script in your own project](#running-as-a-script-in-your-own-project)
    - [Script](#script)
        - [Example usage](#example-usage)
    - [As a library](#as-a-library)
- [Translation prompt](#translation-prompt)
- [Translation verification prompt](#translation-verification-prompt)
- [Styling verification prompt](#styling-verification-prompt)
- [Prompt overriding](#prompt-overriding)

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

### [Running directly](#script)

```bash
git clone git@github.com:taahamahdi/i18n-ai-translate.git
cd i18n-ai-translate
yarn
cp /home/en.json jsons/

# Generate French translations
npm run i18n-ai-translate -- translate -i en.json -o fr.json --engine chatgpt --model gpt-4o --api-key <openai_key>
```

### [Running as a script in your own project](#script)

```bash
yarn add i18n-ai-translate

# Generate French translations
npx i18n-ai-translate translate -i en.json -o fr.json --engine gemini --model gemini-2.0-flash-exp --api-key <gemini_key>

# Or, assuming you already have other translations in the current directory
npx i18n-ai-translate diff --before en-before.json --after en.json --input-language English --engine claude --model claude-3-5-sonnet-latest --api-key <anthropic_key>
```

### [Running as a library](#as-a-library)

```ts
import { translate } from "i18n-ai-translate";
...
const englishJSON = {
  "welcomeMessage": "Welcome, {{name}}!",
  "messages": {
    "notifications_one": "You have one notification",
    "notifications_other": "You have {{count}} notifications",
    "delete": "Would you like to delete the \"{{name}}\" category?"
  }
};

const frenchTranslation = await translate({
  inputJSON: englishJSON,
  inputLanguage: "English",
  outputLanguage: "French",
  ...
});

console.log(frenchTranslation);
```

```json
{
    "welcomeMessage": "Bienvenue, {{name}} !",
    "messages": {
        "notifications_one": "Vous avez une notification",
        "notifications_other": "Vous avez {{count}} notifications",
        "delete": "Voulez-vous supprimer la catégorie « {{name}} » ?"
    }
}
```

## Script

Use `i18n-ai-translate translate` to convert a local i18n JSON file to any language. Relative paths begin from the `jsons/` directory.

Use `i18n-ai-translate diff` to find the differences between two versions of a source language file, and apply them to all language files in the same directory.

Create a `.env` file with an entry for your API key, or pass the `--api-key` flag.

- `GEMINI_API_KEY=<your Gemini API key>`
- `OPENAI_API_KEY=<your OpenAI API key>`
- `ANTHROPIC_API_KEY=<your Anthropic API key>`

For Ollama, create an entry for your host, use the `--host` flag to set a custom host and path (Defaults to `localhost:11434`).

- `OLLAMA_HOSTNAME=<the server and port number running Ollama>`

```
Usage: i18n-ai-translate [options] [command]

Use ChatGPT or Gemini to translate your i18n JSON to any language

Options:
  -V, --version        output the version number
  -h, --help           display help for command

Commands:
  translate [options]
  diff [options]
  help [command]       display help for command
```

```
Usage: i18n-ai-translate translate [options]

Options:
  -i, --input <input>                         Source i18n file or path of source language, in the jsons/ directory if a relative path is given
  -o, --output-languages [language codes...]  A list of languages to translate to
  -e, --engine <engine>                       Engine to use (chatgpt, gemini, ollama, or claude)
  -m, --model <model>                         Model to use (e.g. gpt-4o, gemini-2.0-flash-exp, llama3.3, claude-3-5-sonnet-latest)
  -r, --rate-limit-ms <rateLimitMs>           How many milliseconds between requests (defaults to 1s for Gemini, 120ms (at 500RPM) for ChatGPT, 1200ms
                                              for Claude)
  -f, --force-language-name <language name>   Force output language name
  -A, --all-languages                         Translate to all supported languages
  -p, --templated-string-prefix <prefix>      Prefix for templated strings (default: "{{")
  -s, --templated-string-suffix <suffix>      Suffix for templated strings (default: "}}")
  -k, --api-key <API key>                     API key
  -h, --host <hostIP:port>                    The host and port number serving Ollama. 11434 is the default port number.
  --ensure-changed-translation                Each generated translation key must differ from the input (for keys longer than 4) (default: false)
  -n, --batch-size <batchSize>                How many keys to process at a time (default: "32")
  --skip-translation-verification             Skip validating the resulting translation through another query (default: false)
  --skip-styling-verification                 Skip validating the resulting translation's formatting through another query (default: false)
  --override-prompt <path to JSON file>       Use the prompts from the given JSON file, containing keys for at least one of generationPrompt,
                                              translationVerificationPrompt, stylingVerificationPrompt
  --prompt-mode <prompt-mode>                 Chose between 'csv' mode for better performance and 'json' mode for better compatibility,
  --batch-max-tokens <batch-max-tokens>       For json mode only, maximum size of a single request in tokens
  --verbose                                   Print logs about progress (default: false)
  --help                                      display help for command
```

```
Usage: i18n-ai-translate diff [options]

Options:
  -b, --before <fileOrDirectoryBefore>      Source i18n file or directory before changes, in the jsons/ directory if a relative path is given
  -a, --after <fileOrDirectoryAfter>        Source i18n file or directory after changes, in the jsons/ directory if a relative path is given
  -l, --input-language <inputLanguageCode>  The input language's code, in ISO6391 (e.g. en, fr)
  -e, --engine <engine>                     Engine to use (chatgpt, gemini, ollama, or claude)
  -m, --model <model>                       Model to use (e.g. gpt-4o, gemini-2.0-flash-exp, llama3.3, claude-3-5-sonnet-latest)
  -r, --rate-limit-ms <rateLimitMs>         How many milliseconds between requests (defaults to 1s for Gemini, 120ms (at 500RPM) for ChatGPT, 1200ms for
                                            Claude)
  -k, --api-key <API key>                   API key
  -h, --host <hostIP:port>                  The host and port number serving Ollama. 11434 is the default port number.
  --ensure-changed-translation              Each generated translation key must differ from the input (for keys longer than 4) (default: false)
  -p, --templated-string-prefix <prefix>    Prefix for templated strings (default: "{{")
  -s, --templated-string-suffix <suffix>    Suffix for templated strings (default: "}}")
  -n, --batch-size <batchSize>              How many keys to process at a time (default: "32")
  --skip-translation-verification           Skip validating the resulting translation through another query (default: false)
  --skip-styling-verification               Skip validating the resulting translation's formatting through another query (default: false)
  --override-prompt <path to JSON file>     Use the prompts from the given JSON file, containing keys for at least one of generationPrompt,
                                            translationVerificationPrompt, stylingVerificationPrompt
  --prompt-mode <prompt-mode>               Chose between 'csv' mode for better performance and 'json' mode for better compatibility,
  --batch-max-tokens <batch-max-tokens>     For json mode only, maximum size of a single request in tokens
  --verbose                                 Print logs about progress (default: false)
  --help                                    display help for command
```

### Example usage

#### `npx i18n-ai-translate translate -i en.json -o fr`

- Translate the `en.json` file in `jsons/` to French, and save the output in `fr.json`

#### `npx i18n-ai-translate translate -i en.json -o es de nl --engine gemini`

- Translate the `en.json` file in `jsons/` to Spanish, German, and Dutch, and save each file in `jsons/`, using Google Gemini

#### `npx i18n-ai-translate diff -b en.json -a en-after.json -l English --verbose --engine ollama --host my-olllama-server.com:12345`

- Translate the keys that have changed between `en.json` and `en-after.json` for all files in the `en.json` directory, with logging enabled using Ollama running on `my-ollama-server.com:12345`

#### `npx i18n-ai-translate translate -i en.json -A --engine chatgpt --model gpt-4-turbo --api-key <my_key> --rate-limit-ms 150 -n 64`

- Translate the `en.json` file in `jsons/` to 200+ languages, save each file in `jsons/`, using the GPT-4 Turbo model of ChatGPT, with the given key, a rate limit of 150ms between requests, and 64 keys sent in each batch

#### `npx i18n-ai-translate diff -b en -a en-after --engine claude`

- Translate the keys that have changed between `en/` and `en-after/` for all JSON files in both directories using Claude

## As a library

Alternatively, import this project and use it to convert JSONs on-the-fly with [`translate()`](https://github.com/taahamahdi/i18n-ai-translate/blob/master/src/interfaces/translation_options.ts), or use [`translateDiff()`](https://github.com/taahamahdi/i18n-ai-translate/blob/master/src/interfaces/translation_diff_options.ts) to fetch updates to modified keys when your source i18n file has changed.

```ts
import { translate, translateDiff } from "i18n-ai-translate";

...

const translation = await translate({
    apiKey, // OpenAI/Gemini/Anthropic API key
    batchMaxTokens, // Maximum amount of tokens for one request
    batchSize, // How many keys to process at a time
    chatParams, // Additional configuration to pass to the model
    engine, // ChatGPT, Gemini, Ollama, or Claude
    ensureChangedTranslation, // Every key longer than 4 characters must be different than the input
    host, // The host and port number running Ollama
    inputJSON, // JSON to translate
    inputLanguage, // Language of inputJSON
    model, // Model to use (e.g. gpt-4o, gemini-2.0-flash-exp, llama3.3, claude-3-5-sonnet-latest)
    outputLanguage, // Targeted language (e.g. French, Spanish, etc.)
    overridePrompt, // Set custom prompts for generation or verification
    promptMode, // Chose between 'csv' mode and 'json' mode
    rateLimitMs, // How many milliseconds between requests
    skipStylingVerification, // Whether to skip an additional query to see whether the text formatting remained consistent
    skipTranslationVerification, // Whether to skip an additional query to see whether the resultant translation makes sense
    templatedStringPrefix, // The start of inline variables; defaults to "{{"
    templatedStringSuffix, // The end of inline variables; defaults to "}}"
    verbose, // Print status of conversion to stdout/stderr

});

const translations = await translateDiff({
    apiKey, // OpenAI/Gemini/Anthropic API key
    batchMaxTokens, // Maximum amount of tokens for one request
    batchSize, // How many keys to process at a time
    chatParams, // Additional configuration to pass to the model
    engine, // ChatGPT, Gemini, Ollama, or Claude
    ensureChangedTranslation, // Every key longer than 4 characters must be different than the input
    host, // The host and port number running Ollama
    inputJSONAfter, // The source translation after a change
    inputJSONBefore, // The source translation before a change
    inputLanguage, // Language of inputJSONBefore/After
    model, // Model to use (e.g. gpt-4o, gemini-2.0-flash-exp, llama3.3, claude-3-5-sonnet-latest)
    overridePrompt, // Set custom prompts for generation or verification
    promptMode, // Chose between 'csv' mode and 'json' mode
    rateLimitMs, // How many milliseconds between requests
    skipStylingVerification, // Whether to skip an additional query to see whether the text formatting remained consistent
    skipTranslationVerification, // Whether to skip an additional query to see whether the resultant translation makes sense
    templatedStringPrefix, // The start of inline variables; defaults to "{{"
    templatedStringSuffix, // The end of inline variables; defaults to "}}"
    toUpdateJSONs, // An object of language codes to their translations
    verbose, // Print status of conversion to stdout/stderr
});
```

## CSV Mode

### Translation prompt

Batches of the i18n input are passed in. Each call is checked to ensure no keys are lost, all templated strings are retained, and no translations were skipped.

```
You are a professional translator.

Translate each line from ${inputLanguage} to ${outputLanguage}.

Return translations in the same text formatting.

Maintain case sensitivity and whitespacing.

Output only the translations.

All lines should start and end with an ASCII quotation mark (").

\`\`\`
${input}
\`\`\`
```

### Translation verification prompt

The output of the translation is sent back to ensure the model is okay with the translation. If this fails, the translation is re-generated.

```
Given a translation from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations are poorly translated.

Otherwise, reply with ACK.

Only reply with ACK/NAK.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCSV}
\`\`\`
```

### Styling verification prompt

Formatting from the input should be retained where possible. If punctuation, capitalization, or whitespaces differ between the source and the translation, the translation is re-generated.

```
Given text from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations do not match the formatting of the original.

Check for differing capitalization, punctuation, or whitespaces.

Otherwise, reply with ACK.

Only reply with ACK/NAK.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCSV}
\`\`\`
```

## JSON Mode

### Translation prompt

Batches of the i18n input are passed in. Each call is checked to ensure no keys are lost, all templated strings are retained, and no translations are skipped.

```
You are a professional translator.

Translate from ${inputLanguage} to ${outputLanguage}.

- Translate each object in the array.
- 'original' is the text to be translated.
- 'translated' must not be empty.
- 'context' is additional info if needed.
- 'failure' explains why the previous translation failed.
- Preserve text formatting, case sensitivity, and whitespace.

Special Instructions:
- Treat anything in the format {{variableName}} as a placeholder. Never translate or modify its content.
- Do not add your own variables
- The number of variables like {{timeLeft}} must be the same in the translated text.
- Do not convert {{NEWLINE}} to \\n.

Return the translation as JSON.
\`\`\`json
${input}
\`\`\`
```

### Translation verification prompt

The output of the translation is sent back to ensure the model is okay with the translation/formatting. If this fails, the translation is re-generated.

```
You are a professional translator.

Check translations from ${inputLanguage} to ${outputLanguage}.

- Verify each object in the array.
- 'original' is the text to be translated.
- 'translated' is the translated text.
- 'context' is additional info if needed.
- 'failure' explains why the previous translation failed.
- check for Accuracy (meaning, tone, grammar), Formatting (case, whitespace, punctuation).

If correct, return 'valid' as 'true' and leave 'fixedTranslation' and 'issue' empty.
If incorrect, return 'valid' as 'false' and put the fixed translation in 'fixedTranslation' and explain what is 'issue'.

Special Instructions:
- Treat anything in the format {{variableName}} as a placeholder. Never translate or modify its content.
- Do not add your own variables
- The number of variables like {{timeLeft}} must be the same in the translated text.
- Do not convert {{NEWLINE}} to \\n.

Allow minor grammar, phrasing, and formatting differences if meaning is clear.
Flag only significant issues affecting accuracy or readability.

Return the verified as JSON.
\`\`\`json
${input}
\`\`\`
```

## Prompt overriding

Replace the aforementioned prompts with your own by creating a JSON file containing keys of at least one of `generationPrompt`, `translationVerificationPrompt`, or `stylingVerificationPrompt` (only used in CSV mode). Then, pass it as an argument with `--override-prompt <path to file>`. Be sure to include templated arguments like `${inputLanguage}` as part of the prompt.
