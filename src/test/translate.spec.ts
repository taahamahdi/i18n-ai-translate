import fs from "fs";
import os from "os";
import path from "path";

import * as translateModule from "../translate";
import Engine from "../enums/engine";
import PromptMode from "../enums/prompt_mode";
import { info } from "console";

const fr = (v: string): string => `${v}_fr`;

const mkCaseDir = (): string =>
    fs.mkdtempSync(path.join(os.tmpdir(), "i18n-case-"));

describe("translate", () => {
    it("translates a flat JSON object for PromptMode.JSON", async () => {
        const result = await translateModule.translate({
            engine: Engine.ChatGPT,
            inputJSON: { hello: "Hello" },
            inputLanguage: "en",
            model: "gpt-4o",
            outputLanguage: "fr",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        expect(result).toEqual({ hello: fr("Hello") });
    });

    it("translates a nested JSON object for PromptMode.JSON", async () => {
        const result = await translateModule.translate({
            engine: Engine.ChatGPT,
            inputJSON: { greeting: { text: "Hello" } },
            inputLanguage: "en",
            model: "gpt-4o",
            outputLanguage: "fr",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        expect(result).toEqual({ greeting: { text: fr("Hello") } });
    });

    it("translates a flat JSON object for PromptMode.CSV", async () => {
        const result = await translateModule.translate({
            engine: Engine.ChatGPT,
            inputJSON: { hello: "Hello" },
            inputLanguage: "en",
            model: "gpt-4o",
            outputLanguage: "fr",
            promptMode: PromptMode.CSV,
            rateLimitMs: 0,
        } as any);

        expect(result).toEqual({ hello: fr("Hello") });
    });

    it("translates a nested JSON object for PromptMode.CSV", async () => {
        const result = await translateModule.translate({
            engine: Engine.ChatGPT,
            inputJSON: { greeting: { text: "Hello" } },
            inputLanguage: "en",
            model: "gpt-4o",
            outputLanguage: "fr",
            promptMode: PromptMode.CSV,
            rateLimitMs: 0,
        } as any);

        expect(result).toEqual({ greeting: { text: fr("Hello") } });
    });
});

describe("translateDiff", () => {
    it("only touches added / changed keys", async () => {
        const before = { greeting: "Hello", unchanged: "Stay" };
        const after = { added: "New", greeting: "Hi" };

        const out = await translateModule.translateDiff({
            engine: Engine.ChatGPT,
            inputJSONAfter: after,
            inputJSONBefore: before,
            inputLanguage: "en",
            model: "gpt-4o",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
            toUpdateJSONs: { fr: { greeting: "Bonjour", unchanged: "Rester" } },
        } as any);

        const frOut = out.fr!;
        expect(frOut).toEqual({ added: fr("New"), greeting: fr("Hi") });
    });

    it("only touches added / changed keys with nested objects", async () => {
        const before = { greeting: { text: "Hello" }, unchanged: "Stay" };
        const after = { added: "New", greeting: { text: "Hi" } };

        const out = await translateModule.translateDiff({
            engine: Engine.ChatGPT,
            inputJSONAfter: after,
            inputJSONBefore: before,
            inputLanguage: "en",
            model: "gpt-4o",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
            toUpdateJSONs: {
                fr: { greeting: { text: "Bonjour" }, unchanged: "Rester" },
            },
        } as any);

        const frOut = out.fr!;
        expect(frOut).toEqual({ added: fr("New"), greeting: { text: fr("Hi") } });
    });

    it("prunes removed keys", async () => {
        const before = { greeting: "Hello", unused: "Unused" };
        const after = { greeting: "Hi" };

        const out = await translateModule.translateDiff({
            engine: Engine.ChatGPT,
            inputJSONAfter: after,
            inputJSONBefore: before,
            inputLanguage: "en",
            model: "gpt-4o",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
            toUpdateJSONs: { fr: { greeting: "Bonjour", unused: "Obsolete" } },
        } as any);

        const frOut = out.fr!;
        expect(frOut).toEqual({ greeting: fr("Hi") }); // 'unused' pruned
    });

    it("handles empty input gracefully", async () => {
        const out = await translateModule.translateDiff({
            engine: Engine.ChatGPT,
            inputJSONAfter: {},
            inputJSONBefore: {},
            inputLanguage: "en",
            model: "gpt-4o",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
            toUpdateJSONs: { fr: {} },
        } as any);

        expect(out).toEqual({ fr: {} });
    });
});

describe("translateFile", () => {
    it("creates a sibling file with translated JSON", async () => {
        const dir = mkCaseDir();
        const inputPath = path.join(dir, "en.json");
        const outputPath = path.join(dir, "fr.json");

        fs.writeFileSync(inputPath, JSON.stringify({ cat: "Cat" }));

        await translateModule.translateFile({
            engine: Engine.ChatGPT,
            forceLanguageName: "fr",
            inputFilePath: inputPath,
            inputLanguage: "en",
            model: "gpt-4o",
            outputFilePath: outputPath,
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        const translated = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
        expect(translated).toEqual({ cat: fr("Cat") });
    });

    it("handles empty input file gracefully", async () => {
        const dir = mkCaseDir();
        const inputPath = path.join(dir, "en.json");
        const outputPath = path.join(dir, "fr.json");

        fs.writeFileSync(inputPath, JSON.stringify({}));

        await translateModule.translateFile({
            engine: Engine.ChatGPT,
            forceLanguageName: "fr",
            inputFilePath: inputPath,
            inputLanguage: "en",
            model: "gpt-4o",
            outputFilePath: outputPath,
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        const translated = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
        expect(translated).toEqual({});
    });
});

describe("translateFileDiff", () => {
    it("updates only the changed keys in-place", async () => {
        const dir = mkCaseDir();
        const beforePath = path.join(dir, "before_en.json");
        const afterPath = path.join(dir, "after_en.json");
        const frPath = path.join(dir, "fr.json");

        fs.writeFileSync(beforePath, JSON.stringify({ key: "Old" }));
        fs.writeFileSync(
            afterPath,
            JSON.stringify({ added: "Yes", key: "New" }),
        );
        fs.writeFileSync(frPath, JSON.stringify({ key: "Ancien" }));

        await translateModule.translateFileDiff({
            engine: Engine.ChatGPT,
            inputAfterFileOrPath: afterPath,
            inputBeforeFileOrPath: beforePath,
            inputLanguageCode: "en",
            model: "gpt-4o",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        const out = JSON.parse(fs.readFileSync(frPath, "utf-8"));
        expect(out).toEqual({ added: fr("Yes"), key: fr("New") });
    });

    it("prunes removed keys", async () => {
        const dir = mkCaseDir();
        const beforePath = path.join(dir, "before_en.json");
        const afterPath = path.join(dir, "after_en.json");
        const frPath = path.join(dir, "fr.json");

        fs.writeFileSync(beforePath, JSON.stringify({ key: "Old", unused: "Unused" }));
        fs.writeFileSync(afterPath, JSON.stringify({ key: "New" }));
        fs.writeFileSync(frPath, JSON.stringify({ key: "Ancien", unused: "Obsolete" }));

        await translateModule.translateFileDiff({
            engine: Engine.ChatGPT,
            inputAfterFileOrPath: afterPath,
            inputBeforeFileOrPath: beforePath,
            inputLanguageCode: "en",
            model: "gpt-4o",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        const out = JSON.parse(fs.readFileSync(frPath, "utf-8"));
        expect(out).toEqual({ key: fr("New") }); // 'unused' pruned
    });
});

describe("translateDirectory", () => {
    it("replicates the directory hierarchy for the target language", async () => {
        const dir = mkCaseDir();
        const enDir = path.join(dir, "en");
        fs.mkdirSync(enDir, { recursive: true });

        const enFile = path.join(enDir, "app.json");
        fs.writeFileSync(enFile, JSON.stringify({ welcome: "Welcome" }));

        await translateModule.translateDirectory({
            baseDirectory: dir,
            engine: Engine.ChatGPT,
            inputLanguage: "en",
            model: "gpt-4o",
            outputLanguage: "fr",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        const frFile = path.join(dir, "fr", "app.json");
        const frJSON = JSON.parse(fs.readFileSync(frFile, "utf-8"));
        expect(frJSON).toEqual({ welcome: fr("Welcome") });
    });

    it("handles nested directories", async () => {
        const dir = mkCaseDir();
        const enDir = path.join(dir, "en", "nested");
        fs.mkdirSync(enDir, { recursive: true });

        const enFile = path.join(enDir, "app.json");
        fs.writeFileSync(enFile, JSON.stringify({ greeting: "Hello" }));

        await translateModule.translateDirectory({
            baseDirectory: dir,
            engine: Engine.ChatGPT,
            inputLanguage: "en",
            model: "gpt-4o",
            outputLanguage: "fr",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        const frFile = path.join(dir, "fr", "nested", "app.json");
        const frJSON = JSON.parse(fs.readFileSync(frFile, "utf-8"));
        expect(frJSON).toEqual({ greeting: fr("Hello") });
    });

    it("handles multiple files with various amounts of nesting", async () => {
        const dir = mkCaseDir();
        const enDir = path.join(dir, "en");
        fs.mkdirSync(enDir, { recursive: true });

        // ── layout ────────────────────────────────────────────
        // base/en/app.json          { welcome: "Welcome" }
        // base/en/nested/app.json  { greeting: "Hello" }
        const enFile1 = path.join(enDir, "app.json");
        const enFile2 = path.join(enDir, "nested", "app.json");
        fs.mkdirSync(path.dirname(enFile2), { recursive: true });
        fs.writeFileSync(enFile1, JSON.stringify({ welcome: "Welcome" }));
        fs.writeFileSync(enFile2, JSON.stringify({ greeting: "Hello" }));

        await translateModule.translateDirectory({
            baseDirectory: dir,
            engine: Engine.ChatGPT,
            inputLanguage: "en",
            model: "gpt-4o",
            outputLanguage: "fr",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        const frFile1 = path.join(dir, "fr", "app.json");
        const frFile2 = path.join(dir, "fr", "nested", "app.json");

        const frJSON1 = JSON.parse(fs.readFileSync(frFile1, "utf-8"));
        const frJSON2 = JSON.parse(fs.readFileSync(frFile2, "utf-8"));

        expect(frJSON1).toEqual({ welcome: fr("Welcome") });
        expect(frJSON2).toEqual({ greeting: fr("Hello") });
    });
});

describe("translateDirectoryDiff", () => {
    it("writes translations for changed keys and prunes removed keys", async () => {
        const dir = mkCaseDir();

        // ── layout ────────────────────────────────────────────
        // base/en_before/app.json  { hello: "Hello", unused: "Unused" }
        // base/en_after /app.json  { hello: "Hi", bye: "Bye"          }
        // base/fr       /app.json  { hello: "Bonjour", unused: "Obso" }
        const enBefore = path.join(dir, "en_before");
        const enAfter = path.join(dir, "en_after");
        const frDir = path.join(dir, "fr");

        fs.mkdirSync(enBefore, { recursive: true });
        fs.mkdirSync(enAfter, { recursive: true });
        fs.mkdirSync(frDir, { recursive: true });

        const beforeFile = path.join(enBefore, "app.json");
        const afterFile = path.join(enAfter, "app.json");
        const frFile = path.join(frDir, "app.json");

        fs.writeFileSync(
            beforeFile,
            JSON.stringify({ hello: "Hello", unused: "Unused" }),
        );

        fs.writeFileSync(
            afterFile,
            JSON.stringify({ bye: "Bye", hello: "Hi" }),
        );

        fs.writeFileSync(
            frFile,
            JSON.stringify({ hello: "Bonjour", unused: "Obso" }),
        );

        await translateModule.translateDirectoryDiff({
            baseDirectory: dir,
            engine: Engine.ChatGPT,
            inputFolderNameAfter: "en_after",
            inputFolderNameBefore: "en_before",
            inputLanguageCode: "en",
            model: "gpt-4o",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
            verbose: true,
        } as any);

        const updated = JSON.parse(fs.readFileSync(frFile, "utf-8"));
        expect(updated).toEqual({ bye: fr("Bye"), hello: fr("Hi") }); // 'unused' pruned
    });
});
