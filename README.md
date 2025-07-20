# i18n‑ai‑translate

AI‑powered localization for your **i18next‑style** JSON files. Automate translating of single files or entire directories with ChatGPT, Gemini, Claude, or local Ollama models -- while keeping accurate translations, formatting consistent, and intact `{{variables}}`.

_For a detailed walkthrough and advanced tips, see [ADVANCED_GUIDE.md](ADVANCED_GUIDE.md)._

---

## Why use it?

| Feature               | What it means                                               |
| --------------------- | ----------------------------------------------------------- |
| **Multi‑engine**      | Choose OpenAI, Google, Anthropic, or your own Ollama models |
| **Safe translations** | Dual verification checks accuracy **and** formatting        |
| **Diff‑aware**        | Only re‑translate keys you changed                          |
| **Everywhere**        | Use as a CLI, GitHub Action, or Node library                |
| **Dry‑run**           | Preview updates before touching disk                        |

---

## Quick start

### 1 · Install

```bash
npm i -g i18n-ai-translate    # or yarn add i18n-ai-translate --dev
export OPENAI_API_KEY=•••     # or GEMINI_API_KEY / ANTHROPIC_API_KEY
```

### 2 · Translate a file

```bash
i18n-ai-translate translate -i i18n/en.json -o fr \
  -e chatgpt -m gpt-4o
```

Need more languages? Pass multiple codes (`-o fr es de`) or `-A` for **all** 180+.

### 3 · Translate a folder

```bash
i18n-ai-translate translate -i i18n/en -o fr es de \
  -e chatgpt -m gpt-4o
```

This recursively translates all `*.json` files in `en` and writes to `i18n/fr`, `i18n/es`, and `i18n/de`.

### 4 · Keep PRs up‑to‑date

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
# Translate a file or folder
translate   -i <src>      -o <lang…>   [options]

# Re‑translate only edited keys
diff        -b <before>   -a <after>   [options]

# See all flags
--help
```

Common flags:

| Flag                  | Default         | Description                                         |
| --------------------- | --------------- | --------------------------------------------------- |
| `-e, --engine`        | chatgpt         | chatgpt · gemini · claude · ollama                  |
| `-m, --model`         | gpt-4o          | e.g. gemini‑2.0‑flash‑exp, claude‑3‑5‑sonnet‑latest |
| `-r, --rate-limit-ms` | engine‑specific | Gap between requests                                |
| `--dry-run`           | false           | Don’t write files, preview instead                  |

Full flag list: `i18n-ai-translate translate --help`.

---

## Use as a library

```ts
import { translate } from "i18n-ai-translate";

const fr = await translate({
  inputJSON: require("./en.json"),
  inputLanguage: "en",
  outputLanguage: "fr",
  engine: "chatgpt",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});
```

---

## Advanced topics

* **Prompt modes**: `csv` (faster) vs `json` (maximum fidelity)
* **Custom prompts**: swap in your own generation / verification prompts
* **Placeholders**: keep `{{prefix}}` & `{{suffix}}` exactly as‑is
