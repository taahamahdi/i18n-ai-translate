# i18n‑ai‑translate

AI‑powered localization for your **i18next‑style** JSON files. Automate translating single files or entire directories with ChatGPT, Gemini, Claude, or local Ollama models — while keeping translations accurate, formatting consistent, and `{{variables}}` intact.

_For a detailed walkthrough and advanced tips, see [ADVANCED_GUIDE.md](ADVANCED_GUIDE.md)._

---

## Why use it?

| Feature               | What it means                                                                           |
| --------------------- | --------------------------------------------------------------------------------------- |
| **Multi‑engine**      | Choose OpenAI, Google, Anthropic, or your own Ollama models                             |
| **Fast**              | Parallel per-batch workers share one rate limiter; translate 20 locales concurrently    |
| **Safe**              | Translations verified against the source before being written                           |
| **Diff‑aware**        | Only re‑translate keys you changed; existing translations are preserved                 |
| **Check mode**        | Audit existing translations for drift, missing placeholders, or quality regressions     |
| **Context-aware**     | `--context` flag injects product info so the model picks domain-appropriate terminology |
| **Dry‑run**           | Preview updates before touching disk                                                    |
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

### 6 · Keep PRs up‑to‑date

Add a one‑liner GitHub Action to auto‑translate whenever `en.json` changes:

```yaml
- uses: taahamahdi/i18n-ai-translate@master
  with:
    json-file-path: i18n/en.json
    api-key: ${{ secrets.OPENAI_API_KEY }}
```

---

## CLI cheat‑sheet

```bash
translate  -i <src>      -o <lang…>   [options]   # Translate a file or folder
diff       -b <before>   -a <after>   [options]   # Re‑translate only edited keys
check      -i <src>      -o <lang…>   [options]   # Verify existing translations (no writes)
```

Common flags (all subcommands accept these unless noted):

| Flag                      | Default         | Description                                                                     |
| ------------------------- | --------------- | ------------------------------------------------------------------------------- |
| `-e, --engine`            | chatgpt         | chatgpt · gemini · claude · ollama                                              |
| `-m, --model`             | gpt‑5.2         | e.g. `gemini‑2.5‑flash`, `claude‑sonnet‑4‑6`, `llama3.3`                        |
| `-l, --input-language`    | from filename   | ISO‑639‑1 code or English name (`en`, `French`) — BCP‑47 tags like `pt-BR` OK   |
| `-r, --rate-limit-ms`     | engine‑specific | Minimum gap between requests                                                    |
| `--concurrency`           | 2               | Batches to run in parallel within one language                                  |
| `--language-concurrency`  | 1               | Target languages to translate in parallel (shares pool + rate limit)            |
| `--tokens-per-minute`     | off             | Extra TPM cap across all workers; pair with `--concurrency` to stay under tier  |
| `--context <string>`      | —               | Product/domain context, e.g. `"a B2B invoicing SaaS"`                           |
| `--exclude-languages`     | —               | Locales to skip (for manually‑maintained targets)                               |
| `--no-continue-on-error`  | continue        | Abort on first key/batch failure instead of skipping                            |
| `--dry-run`               | false           | Don't write files, preview instead (translate/diff only)                        |
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

* **Prompt modes**: `csv` (faster, GPT‑class models only) vs `json` (structured output, works with weaker models too)
* **Custom prompts**: swap in your own generation/verification prompts via `--override-prompt`
* **Plural awareness**: keys ending in `_one`/`_other`/`_few`/`_many` get a CLDR plural hint in JSON mode
* **Placeholders**: `{{variables}}` are preserved; customise delimiters with `-p`/`-s`
* **Rate-limit handling**: per-engine defaults + exponential backoff; `--tokens-per-minute` adds TPM cap
