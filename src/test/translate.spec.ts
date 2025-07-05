import fs from "fs";
import os from "os";
import path from "path";

import * as translateModule from "../translate";
import Engine from "../enums/engine";
import PromptMode from "../enums/prompt_mode";

const fr = (v: string): string => `${v}_fr`;
const es = (v: string): string => `${v}_es`;

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
        expect(frOut).toEqual({
            added: fr("New"),
            greeting: { text: fr("Hi") },
        });
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

    it("handles multiple languages", async () => {
        const before = { greeting: "Hello" };
        const after = { added: "New", greeting: "Hi" };

        const out = await translateModule.translateDiff({
            engine: Engine.ChatGPT,
            inputJSONAfter: after,
            inputJSONBefore: before,
            inputLanguage: "en",
            model: "gpt-4o",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
            toUpdateJSONs: {
                es: { greeting: "Hola" },
                fr: { greeting: "Bonjour" },
            },
        } as any);

        expect(out.fr).toEqual({ added: fr("New"), greeting: fr("Hi") });
        expect(out.es).toEqual({ added: es("New"), greeting: es("Hi") });
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

        fs.writeFileSync(
            beforePath,
            JSON.stringify({ key: "Old", unused: "Unused" }),
        );
        fs.writeFileSync(afterPath, JSON.stringify({ key: "New" }));
        fs.writeFileSync(
            frPath,
            JSON.stringify({ key: "Ancien", unused: "Obsolete" }),
        );

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

    it("handles multiple languages", async () => {
        const dir = mkCaseDir();
        const beforePath = path.join(dir, "before_en.json");
        const afterPath = path.join(dir, "after_en.json");
        const frPath = path.join(dir, "fr.json");
        const esPath = path.join(dir, "es.json");

        fs.writeFileSync(beforePath, JSON.stringify({ key: "Old" }));
        fs.writeFileSync(afterPath, JSON.stringify({ added: "Yes", key: "New" }));
        fs.writeFileSync(frPath, JSON.stringify({ key: "Ancien" }));
        fs.writeFileSync(esPath, JSON.stringify({ key: "Viejo" }));

        await translateModule.translateFileDiff({
            engine: Engine.ChatGPT,
            inputAfterFileOrPath: afterPath,
            inputBeforeFileOrPath: beforePath,
            inputLanguageCode: "en",
            model: "gpt-4o",
            promptMode: PromptMode.JSON,
            rateLimitMs: 0,
        } as any);

        const frOut = JSON.parse(fs.readFileSync(frPath, "utf-8"));
        const esOut = JSON.parse(fs.readFileSync(esPath, "utf-8"));

        expect(frOut).toEqual({ added: fr("Yes"), key: fr("New") });
        expect(esOut).toEqual({ added: es("Yes"), key: es("New") });
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

    it("handles nested directories and multiple files", async () => {
        const dir = mkCaseDir();

        // ── layout ────────────────────────────────────────────
        // base/en_before/app.json          { welcome: "Welcome" }
        // base/en_after /app.json          { greeting: "Hello"   }
        // base/en_after /nested/app.json   { farewell: "Goodbye" }
        // base/fr       /app.json          { welcome: "Bienvenue" }

        const enBefore = path.join(dir, "en_before");
        const enAfter = path.join(dir, "en_after");
        const frDir = path.join(dir, "fr");

        fs.mkdirSync(enBefore, { recursive: true });
        fs.mkdirSync(enAfter, { recursive: true });
        fs.mkdirSync(frDir, { recursive: true });
        fs.mkdirSync(path.join(enAfter, "nested"), { recursive: true });

        const beforeFile = path.join(enBefore, "app.json");
        const afterFile = path.join(enAfter, "app.json");
        const afterNestedFile = path.join(enAfter, "nested", "app.json");
        const frFile = path.join(frDir, "app.json");
        const frNestedFile = path.join(frDir, "nested", "app.json");

        fs.writeFileSync(beforeFile, JSON.stringify({ welcome: "Welcome" }));
        fs.writeFileSync(afterFile, JSON.stringify({ greeting: "Hello" }));
        fs.writeFileSync(
            afterNestedFile,
            JSON.stringify({ farewell: "Goodbye" }),
        );

        fs.writeFileSync(
            frFile,
            JSON.stringify({ welcome: "Bienvenue" }),
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
        const updatedNested = JSON.parse(fs.readFileSync(frNestedFile, "utf-8"));

        expect(updated).toEqual({ greeting: fr("Hello") });
        expect(updatedNested).toEqual({ farewell: fr("Goodbye") });
    });

    it("handles multiple languages in the directory", async () => {
        const dir = mkCaseDir();

        // ── layout ────────────────────────────────────────────
        // base/en_before/app.json  { hello: "Hello" }
        // base/en_after /app.json  { hello: "Hi"     }
        // base/fr       /app.json  { hello: "Bonjour" }
        // base/es       /app.json  { hello: "Hola"    }

        const enBefore = path.join(dir, "en_before");
        const enAfter = path.join(dir, "en_after");
        const frDir = path.join(dir, "fr");
        const esDir = path.join(dir, "es");

        fs.mkdirSync(enBefore, { recursive: true });
        fs.mkdirSync(enAfter, { recursive: true });
        fs.mkdirSync(frDir, { recursive: true });
        fs.mkdirSync(esDir, { recursive: true });

        const beforeFile = path.join(enBefore, "app.json");
        const afterFile = path.join(enAfter, "app.json");
        const frFile = path.join(frDir, "app.json");
        const esFile = path.join(esDir, "app.json");

        fs.writeFileSync(beforeFile, JSON.stringify({ hello: "Hello" }));
        fs.writeFileSync(afterFile, JSON.stringify({ hello: "Hi" }));
        fs.writeFileSync(frFile, JSON.stringify({ hello: "Bonjour" }));
        fs.writeFileSync(esFile, JSON.stringify({ hello: "Hola" }));

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

        const updatedFr = JSON.parse(fs.readFileSync(frFile, "utf-8"));
        const updatedEs = JSON.parse(fs.readFileSync(esFile, "utf-8"));

        expect(updatedFr).toEqual({ hello: fr("Hi") });
        expect(updatedEs).toEqual({ hello: es("Hi") });
    });
});
