# i18n-ai-translate — AI translation for your i18n locale files

[![npm version](https://img.shields.io/npm/v/i18n-ai-translate.svg)](https://www.npmjs.com/package/i18n-ai-translate)
[![npm downloads](https://img.shields.io/npm/dw/i18n-ai-translate.svg)](https://www.npmjs.com/package/i18n-ai-translate)
[![Build](https://img.shields.io/github/actions/workflow/status/taahamahdi/i18n-ai-translate/build.yml?branch=master)](https://github.com/taahamahdi/i18n-ai-translate/actions/workflows/build.yml)
[![License: GPL-3.0](https://img.shields.io/npm/l/i18n-ai-translate.svg)](https://github.com/taahamahdi/i18n-ai-translate/blob/master/LICENSE)

**Auto-translate i18n JSON and other locale files using AI.** Point it at one file or a whole directory and it machine-translates your app into any language with ChatGPT, Gemini, Claude, or local Ollama models — keeping translations accurate, formatting consistent, and placeholders intact.

Works with **i18next-style JSON** out of the box, plus Gettext `.po`, Java `.properties`, iOS `.strings`, Rails YAML, JS/TS locale modules, and ICU MessageFormat (next-intl). Use it as a **CLI**, a **Node library**, or a **GitHub Action** that translates every pull request automatically.

_For a detailed walkthrough and advanced tips, see [ADVANCED_GUIDE.md](ADVANCED_GUIDE.md)._

---

## Why use it?

| Feature               | What it means                                                                           |
| --------------------- | --------------------------------------------------------------------------------------- |
| **Multi-engine**      | Choose OpenAI, Google, Anthropic, or your own Ollama models                             |
| **Fast**              | Parallel per-batch workers share one rate limiter; translate 20 locales concurrently    |
| **Safe**              | Translations verified against the source before being written                           |
| **Diff-aware**        | Only re-translate keys you changed; existing translations are preserved                 |
| **Check mode**        | Audit existing translations for drift, missing placeholders, or quality regressions     |
| **Format-aware**      | i18next JSON, Gettext `.po`, Java `.properties`, iOS `.strings`, Rails `.yml`, JS/TS modules, ICU/next-intl — round-tripped intact |
| **Context-aware**     | `--context` flag injects product info so the model picks domain-appropriate terminology |
| **Dry-run**           | Preview updates before touching disk                                                    |
| **Everywhere**        | Use as a CLI, GitHub Action, or Node library                                            |

---

## Quick start

### 1 · Install

```bash
npm i -g i18n-ai-translate    # or yarn add i18n-ai-translate --dev
export OPENAI_API_KEY=•••     # or GEMINI_API_KEY / ANTHROPIC_API_KEY
```

### 2 · Translate a file

```bash
i18n-ai-translate translate -i i18n/en.json -o fr \
  -e chatgpt -m gpt-5.2
```

Need more languages? Pass multiple codes (`-o fr es de`) or `-A` for **all** 180+. Filenames like `es-ES.json` / `pt-BR.json` are accepted too — the language subtag is extracted automatically. Skip specific locales with `--exclude-languages fr de` (handy for locales you maintain by hand).

**Other formats:** besides i18next JSON, Gettext `.po`, Java `.properties`, iOS `.strings`, Rails `.yml`/`.yaml`, and JavaScript/TypeScript locale modules (`.ts`, `.js`, `.mjs`, `.cjs`, `.mts`, `.cts`) work too — the format is inferred from the file extension (override with `--file-format json|po|properties|strings|yaml|ts|js|icu`). Non-translatable structure round-trips losslessly: PO comments, `msgctxt`, and plural forms; `.properties` comments, separators, and line continuations; `.strings` `/* */` and `//` comments and quoting; YAML comments, key order, and quoting style; JS/TS imports, comments, type annotations, and `satisfies`/`as const` clauses. Native placeholders (`printf` `%s`/`%1$s`/`%@`, MessageFormat `{0}`/`{1}`, Rails `%{name}`/`%<name>s`) are preserved across the translation. Works across `translate` (file + folder), `diff`, and `check`.

For a JS/TS module, the catalogue is found as `export default {…}`, `module.exports = {…}`, or an exported `const` holding an object literal, and only plain string literals are translated — numbers, template literals with `${…}` substitutions, and computed keys are left exactly as written. Rails YAML files may be locale-rooted (`en:` at the top level); the root key is retargeted to the output language on write, so `en.yml` → `fr.yml` gets `fr:`.

```yaml
# en.yml                          # fr.yml, after `translate -i en.yml -o fr`
en:                               fr:
  greeting: Hello                   greeting: Bonjour
  inbox:                            inbox:
    unread: "%{count} unread"         unread: "%{count} non lus"
```

**ICU MessageFormat / next-intl:** pass `--file-format icu` (it is not bound to `.json`, so i18next catalogues are untouched). Plural and select messages are translated as whole sentences per branch and re-assembled against the target language's CLDR categories, so English `one`/`other` becomes `one`/`few`/`many`/`other` in Russian:

```json
// en.json                                          fr.json, after --file-format icu -o fr
"items": "You have {count, plural,                  "items": "{count, plural,
  one {# item} other {# items}} left"                 one {Il reste # article}
                                                      other {Il reste # articles}}"
```

### 3 · Translate a folder

```bash
i18n-ai-translate translate -i i18n/en -o fr es de \
  -e chatgpt -m gpt-5.2
```

Recursively translates every `*.json` file in `en` and writes the results to `i18n/fr`, `i18n/es`, and `i18n/de`.

### 4 · Translate only what changed

```bash
i18n-ai-translate diff \
  -b i18n/en-before.json -a i18n/en.json \
  -l en -e claude -m claude-sonnet-4-6
```

Preserves every existing translation; only added/modified keys are re-translated, only deleted keys are removed. Per-locale writes are persisted as each language finishes, so a mid-run crash doesn't discard completed work.

### 5 · Check an existing translation

```bash
i18n-ai-translate check -i i18n/en.json -o fr de \
  -e chatgpt -m gpt-5.2 --format json
```

Runs the verification pipeline against your existing translations without writing anything. Emits a structured report of keys the model flagged. Exits non-zero if any issue is found, so you can gate CI on it.

### 6 · Keep PRs up-to-date

Add a one-liner GitHub Action to auto-translate whenever `en.json` changes:

```yaml
permissions:
  contents: write   # the Action commits translations back to the PR

# ...
- uses: taahamahdi/i18n-ai-translate@master
  with:
    file-path: i18n/en.json
    api-key: ${{ secrets.OPENAI_API_KEY }}
```

---

## CLI cheat-sheet

```bash
translate  -i <src>      -o <lang…>   [options]   # Translate a file or folder
diff       -b <before>   -a <after>   [options]   # Re-translate only edited keys
check      -i <src>      -o <lang…>   [options]   # Verify existing translations (no writes)
```

Common flags (all subcommands accept these unless noted):

| Flag                      | Default         | Description                                                                     |
| ------------------------- | --------------- | ------------------------------------------------------------------------------- |
| `-e, --engine`            | chatgpt         | chatgpt · gemini · claude · ollama                                              |
| `-m, --model`             | gpt-5.2         | e.g. `gemini-2.5-flash`, `claude-sonnet-4-6`, `llama3.3`                        |
| `-l, --input-language`    | from filename   | ISO-639-1 code or English name (`en`, `French`) — BCP-47 tags like `pt-BR` OK   |
| `-r, --rate-limit-ms`     | engine-specific | Minimum gap between requests                                                    |
| `--concurrency`           | 2               | Batches to run in parallel within one language                                  |
| `--language-concurrency`  | 1               | Target languages to translate in parallel (shares pool + rate limit)            |
| `--tokens-per-minute`     | off             | Extra TPM cap across all workers; pair with `--concurrency` to stay under tier  |
| `--context <string>`      | —               | Product/domain context, e.g. `"a B2B invoicing SaaS"`                           |
| `--glossary <path>`       | —               | JSON file: keep-verbatim terms + forced per-language translations               |
| `--exclude-languages`     | —               | Locales to skip (for manually-maintained targets)                               |
| `--no-continue-on-error`  | continue        | Abort on first key/batch failure instead of skipping                            |
| `--dry-run`               | false           | Don't write files, preview instead (translate/diff only)                        |
| `--cache [path]`          | off             | Reuse a translation memory across runs; skip unchanged strings (translate/diff) |
| `--file-format`           | from extension  | File format: `json`, `po`, `properties`, `strings`, `yaml`, `ts`, `js`, `icu` (translate/diff/check) |
| `--format`                | table           | `table` or `json` report output (check only)                                    |

Full flag list: `i18n-ai-translate <subcommand> --help`.

---

## Use as a library

```ts
import { translate, translateDiff, check } from "i18n-ai-translate";

const fr = await translate({
  inputJSON: require("./en.json"),
  inputLanguageCode: "en",
  outputLanguageCode: "fr",
  engine: "chatgpt",
  model: "gpt-5.2",
  apiKey: process.env.OPENAI_API_KEY,
  context: "a music trivia game for Discord", // optional
  concurrency: 4,                             // optional
});

const report = await check({
  inputJSON: require("./en.json"),
  targetJSON: require("./fr.json"),
  inputLanguageCode: "en",
  outputLanguageCode: "fr",
  engine: "chatgpt",
  model: "gpt-5.2",
  apiKey: process.env.OPENAI_API_KEY,
});
// report.issues = [{ key, original, translated, issue, suggestion }]
```

---

## Advanced topics

* **Prompt modes**: `csv` (faster, GPT-class models only) vs `json` (structured output, works with weaker models too)
* **Custom prompts**: swap in your own generation/verification prompts via `--override-prompt`
* **Translation memory**: `--cache [path]` stores translations in a JSON file (default `.i18n-ai-translate-cache.json`) and reuses them on later runs, so unchanged strings are never re-sent to the model. The key is the source text + languages + `--context` — independent of engine/model, so the cache survives a provider switch. Library callers can pass their own `cache` object.
* **Glossary**: `--glossary <path>` points to a JSON file that steers terminology — `doNotTranslate` keeps brand/product names verbatim, and `terms` forces exact per-language translations: `{ "doNotTranslate": ["Acme"], "terms": { "fr": { "Account": "Compte" } } }`. The rules are injected into both the generation and verification prompts; only the run's target language is applied (with BCP-47 base-subtag fallback, so `pt` covers `pt-BR`).
* **Plural awareness**: keys ending in `_one`/`_other`/`_few`/`_many` get a CLDR plural hint in JSON mode
* **Placeholders**: `{{variables}}` are preserved; customise delimiters with `-p`/`-s`
* **Rate-limit handling**: per-engine defaults + exponential backoff; `--tokens-per-minute` adds TPM cap
