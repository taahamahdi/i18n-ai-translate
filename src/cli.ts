import { VERSION } from "./constants";
import { config } from "dotenv";
import { program } from "commander";
import buildDiffCommand from "./cli_diff";
import buildTranslateCommand from "./cli_translate";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });

program
    .name("i18n-ai-translate")
    .description(
        "Use ChatGPT, Gemini, Ollama, or Anthropic to translate your i18n JSON to any language",
    )
    .version(VERSION);

program.addCommand(buildTranslateCommand());
program.addCommand(buildDiffCommand());
program.parse();
