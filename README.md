# `i18n-ai-translate`

Use ChatGPT or Google Gemini to translate your i18n JSON to any language.

Three prompts are chained to ensure each translation is well-formed.

1. The translation prompt attempts a translation
2. The translation validation prompt uses a separate context to verify the translation
3. The styling validation prompt uses a separate context to verify the translation's formatting is consistent with the source

History is retained between calls to ensure consistency when translating the entire file.

# Usage
## GitHub Actions
Incorporate it into your CI with a GitHub Action to auto-translate keys for every pull request:
```yaml
name: i18n-ai-translate

on:
  pull_request:
    branches:
      - master
    paths:
      - 'i18n/en.json'

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout Repo
      uses: actions/checkout@v3
      with:
        ref: ${{ github.head_ref }}
        fetch-depth: 0

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install Dependencies
      run: yarn add i18n-ai-translate

    - name: Setup Git Config
      run: |
        git config --global user.email "mahditaaha11@gmail.com"
        git config --global user.name "Taaha Mahdi"

    - name: Copy .env for CI
      env:
        GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      run: |
        echo "GEMINI_API_KEY=$GEMINI_API_KEY" >> .env
      shell: bash

    - name: Fetch original translation
      run: |
        cp i18n/en.json i18n/en-latest.json
        git checkout origin/master -- i18n/en.json

    - name: Translate the diff
      run: |
        npx i18n-ai-translate diff -b i18n/en.json -a i18n/en-latest.json -l "English" --verbose
        mv i18n/en-latest.json i18n/en.json
        git add .
        git commit -m "Update translations" || echo "No changes to commit"
        git push
```

## Script
Use `i18n-ai-translate translate` to convert a local i18n JSON file to any language. Relative paths begin from the `jsons/` directory.

Use `i18n-ai-translate diff` to find translate the differences between a source language, and apply them to all language files in the same directory.

Create a `.env` file with an entry `GEMINI_API_KEY=<your Gemini API key>`, or pass the `--api-key` flag.

```
Usage: i18n-ai-translate [options] [command]

Use Google Gemini to translate your i18n JSON to any language

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
  -i, --input <input>                        Source i18n file, in the jsons/ directory if a relative path is given
  -o, --output <output>                      Output i18n file, in the jsons/ directory if a relative path is given
  -f, --force-language-name <language name>  Force language name
  -A, --all-languages                        Translate to all supported languages
  -l, --languages [language codes...]        Pass a list of languages to translate to
  -p, --templated-string-prefix <prefix>     Prefix for templated strings (default: "{{")
  -s, --templated-string-suffix <suffix>     Suffix for templated strings (default: "}}")
  -k, --api-key <Gemini API key>             Gemini API key
  --ensure-changed-translation               Each generated translation key must differ from the input (for keys longer than 4) (default: false)
  -n, --batch-size <batchSize>               How many keys to process at a time (default: "32")
  --verbose                                  Print logs about progress (default: false)
  -h, --help                                 display help for command
```

```
Usage: i18n-ai-translate diff [options]

Options:
  -b, --before <fileBefore>             Source i18n file before changes, in the jsons/ directory if a relative path is given
  -a, --after <fileAfter>               Source i18n file after changes, in the jsons/ directory if a relative path is given
  -l, --input-language <inputLanguage>  The full input language name
  -k, --api-key <Gemini API key>        Gemini API key
  --ensure-changed-translation          Each generated translation key must differ from the input (for keys longer than 4) (default: false)
  -n, --batch-size <batchSize>          How many keys to process at a time (default: "32")
  --verbose                             Print logs about progress (default: false)
  -h, --help                            display help for command
```

### Example usage
#### `npx i18n-ai-translate translate -i en.json -o fr.json`
* Translate the `en.json` file in `jsons/` to French, and save the output in `fr.json`

#### `npx i18n-ai-translate translate -i en.json -l es de nl`
* Translate the `en.json` file in `jsons/` to Spanish, German, and Dutch, and save each file in `jsons/`

#### `npx i18n-ai-translate diff -b en.json -a en-after.json -l English --verbose`
* Translate the keys that have changed between `en.json` and `en-after.json` for all files in the `en.json` directory, with logging enabled

## As a library
Alternatively, import this project and use it to convert JSONs on-the-fly with `translate()`, or use `translateDiff()` to fetch updates to modified keys when your source i18n file has changed.

```ts
import { translate, translateDiff } from "i18n-ai-translate";

...

const translation = await translate({
    apiKey, // Gemini API key
    inputJSON, // JSON to translate
    inputLanguage, // Language of inputJSON
    outputLanguage, // Targeted language (e.g. French, Spanish, etc.)
    templatedStringPrefix, // The start of inline variables; defaults to "{{"
    templatedStringSuffix, // The end of inline variables; defaults to "}}"
    verbose, // Print status of conversion to stdout/stderr
    ensureChangedTranslation, // Every key longer than 4 characters must be different than the input
    batchSize, // How many keys to process at a time
});

const translations = await translateDiff({
    apiKey, // Gemini API key
    inputLanguage, // Language of inputJSONBefore/After
    inputJSONBefore, // The source translation before a change
    inputJSONAfter, // The source translation after a change
    inputLanguage, // Language of inputJSONBefore/After
    toUpdateJSONs, // An object of language codes to their translations
    templatedStringPrefix, // The start of inline variables; defaults to "{{"
    templatedStringSuffix, // The end of inline variables; defaults to "}}"
    ensureChangedTranslation, // Every key longer than 4 characters must be different than the input
    verbose, // Print status of conversion to stdout/stderr
    batchSize, // How many keys to process at a time
});
```


## Translation prompt
Batches of the i18n input are passed in. Each call is checked to ensure no keys are lost, all templated strings are retained, and no translations were skipped.
```
You are a professional translator.

Translate each line from ${inputLanguage} to ${outputLanguage}.

Return translations in the same text formatting.

Maintain case sensitivity and whitespacing.

Output only the translations.

All lines should start and end with an ASCII quotation mark (").

${input}
```

## Translation verification prompt
The output of the translation is sent back to ensure the model is okay with the translation. If this fails, the translation is re-generated.
```
Given a translation from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations are poorly translated. Otherwise, reply with ACK. Only reply with ACK/NAK.

**Be as nitpicky as possible.** If even the smallest thing seems off, you should reply NAK.

${inputLanguage},${outputLanguage}
${mergedCsv}
```

## Styling verification prompt
Formatting from the input should be retained where possible. If punctuation, capitalization, or whitespaces differ between the source and the translation, the translation is re-generated.
```
Given text from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations do not match the formatting of the original. Check for differing capitalization, punctuation, or whitespaces. Otherwise, reply with ACK. Only reply with ACK/NAK.

**Be as nitpicky as possible.** If even the smallest thing seems off, you should reply NAK.

${inputLanguage},${outputLanguage}
${mergedCsv}
```
