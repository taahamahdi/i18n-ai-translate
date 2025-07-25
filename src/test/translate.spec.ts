import fs from "fs";
import os from "os";
import path from "path";

import * as utils from "../utils";
import { translate, translateDiff } from "../translate";
import {
    translateDirectory,
    translateDirectoryDiff,
} from "../translate_directory";
import { translateFile, translateFileDiff } from "../translate_file";
import Engine from "../enums/engine";
import PromptMode from "../enums/prompt_mode";
import RateLimiter from "../rate_limiter";

const fr = (v: string): string => `${v}_fr`;
const es = (v: string): string => `${v}_es`;

const mkCaseDir = (): string =>
    fs.mkdtempSync(path.join(os.tmpdir(), "i18n-case-"));

describe.each(Object.values(PromptMode))(
    "translate (promptMode=%s)",
    (promptMode) => {
        it("translates a flat JSON object", async () => {
            const result = await translate({
                engine: Engine.ChatGPT,
                inputJSON: { hello: "Hello" },
                inputLanguageCode: "en",
                model: "gpt-4o",
                outputLanguageCode: "fr",
                promptMode,
                rateLimitMs: 0,
            } as any);

            expect(result).toEqual({ hello: fr("Hello") });
        });

        it("translates a nested JSON object", async () => {
            const result = await translate({
                engine: Engine.ChatGPT,
                inputJSON: { greeting: { text: "Hello" } },
                inputLanguageCode: "en",
                model: "gpt-4o",
                outputLanguageCode: "fr",
                promptMode,
                rateLimitMs: 0,
            } as any);

            expect(result).toEqual({ greeting: { text: fr("Hello") } });
        });

        it("de-duplicates identical strings and includes them all in output", async () => {
            const input = { a: "Hello", b: "Hello", c: { d: "Hello" } };

            const result = await translate({
                engine: Engine.ChatGPT,
                inputJSON: input,
                inputLanguageCode: "en",
                model: "gpt-4o",
                outputLanguageCode: "fr",
                promptMode,
                rateLimitMs: 0,
            } as any);

            expect(result).toEqual({
                a: fr("Hello"),
                b: fr("Hello"),
                c: { d: fr("Hello") },
            });
        });
    },
);

describe.each(Object.values(PromptMode))(
    "translateDiff (promptMode=%s)",
    (promptMode) => {
        it("only touches added / changed keys", async () => {
            const before = { greeting: "Hello", unchanged: "Stay" };
            const after = { added: "New", greeting: "Hi" };

            const out = await translateDiff({
                engine: Engine.ChatGPT,
                inputJSONAfter: after,
                inputJSONBefore: before,
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
                rateLimitMs: 0,
                toUpdateJSONs: {
                    fr: { greeting: "Bonjour", unchanged: "Rester" },
                },
            } as any);

            const frOut = out.fr!;
            expect(frOut).toEqual({ added: fr("New"), greeting: fr("Hi") });
        });

        it("only touches added / changed keys with nested objects", async () => {
            const before = { greeting: { text: "Hello" }, unchanged: "Stay" };
            const after = { added: "New", greeting: { text: "Hi" } };

            const out = await translateDiff({
                engine: Engine.ChatGPT,
                inputJSONAfter: after,
                inputJSONBefore: before,
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
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

            const out = await translateDiff({
                engine: Engine.ChatGPT,
                inputJSONAfter: after,
                inputJSONBefore: before,
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
                rateLimitMs: 0,
                toUpdateJSONs: {
                    fr: { greeting: "Bonjour", unused: "Obsolete" },
                },
            } as any);

            const frOut = out.fr!;
            expect(frOut).toEqual({ greeting: fr("Hi") }); // 'unused' pruned
        });

        it("handles empty input gracefully", async () => {
            const out = await translateDiff({
                engine: Engine.ChatGPT,
                inputJSONAfter: {},
                inputJSONBefore: {},
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
                rateLimitMs: 0,
                toUpdateJSONs: { fr: {} },
            } as any);

            expect(out).toEqual({ fr: {} });
        });

        it("handles multiple languages", async () => {
            const before = { greeting: "Hello" };
            const after = { added: "New", greeting: "Hi" };

            const out = await translateDiff({
                engine: Engine.ChatGPT,
                inputJSONAfter: after,
                inputJSONBefore: before,
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
                rateLimitMs: 0,
                toUpdateJSONs: {
                    es: { greeting: "Hola" },
                    fr: { greeting: "Bonjour" },
                },
            } as any);

            expect(out.fr).toEqual({ added: fr("New"), greeting: fr("Hi") });
            expect(out.es).toEqual({ added: es("New"), greeting: es("Hi") });
        });
    },
);

describe.each(Object.values(PromptMode))(
    "translateFile (promptMode=%s)",
    (promptMode) => {
        it("creates a sibling file with translated JSON", async () => {
            const dir = mkCaseDir();
            const inputPath = path.join(dir, "en.json");
            const outputPath = path.join(dir, "fr.json");

            fs.writeFileSync(inputPath, JSON.stringify({ cat: "Cat" }));

            await translateFile({
                engine: Engine.ChatGPT,
                forceLanguageName: "fr",
                inputFilePath: inputPath,
                inputLanguageCode: "en",
                model: "gpt-4o",
                outputFilePath: outputPath,
                promptMode,
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

            await translateFile({
                engine: Engine.ChatGPT,
                forceLanguageName: "fr",
                inputFilePath: inputPath,
                inputLanguageCode: "en",
                model: "gpt-4o",
                outputFilePath: outputPath,
                promptMode,
                rateLimitMs: 0,
            } as any);

            const translated = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
            expect(translated).toEqual({});
        });
    },
);

describe.each(Object.values(PromptMode))(
    "translateFileDiff (promptMode=%s)",
    (promptMode) => {
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

            await translateFileDiff({
                engine: Engine.ChatGPT,
                inputAfterFileOrPath: afterPath,
                inputBeforeFileOrPath: beforePath,
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
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

            await translateFileDiff({
                engine: Engine.ChatGPT,
                inputAfterFileOrPath: afterPath,
                inputBeforeFileOrPath: beforePath,
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
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
            fs.writeFileSync(
                afterPath,
                JSON.stringify({ added: "Yes", key: "New" }),
            );
            fs.writeFileSync(frPath, JSON.stringify({ key: "Ancien" }));
            fs.writeFileSync(esPath, JSON.stringify({ key: "Viejo" }));

            await translateFileDiff({
                engine: Engine.ChatGPT,
                inputAfterFileOrPath: afterPath,
                inputBeforeFileOrPath: beforePath,
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
                rateLimitMs: 0,
            } as any);

            const frOut = JSON.parse(fs.readFileSync(frPath, "utf-8"));
            const esOut = JSON.parse(fs.readFileSync(esPath, "utf-8"));

            expect(frOut).toEqual({ added: fr("Yes"), key: fr("New") });
            expect(esOut).toEqual({ added: es("Yes"), key: es("New") });
        });
    },
);

describe.each(Object.values(PromptMode))(
    "translateDirectory (promptMode=%s)",
    (promptMode) => {
        it("replicates the directory hierarchy for the target language", async () => {
            const dir = mkCaseDir();
            const enDir = path.join(dir, "en");
            fs.mkdirSync(enDir, { recursive: true });

            const enFile = path.join(enDir, "app.json");
            fs.writeFileSync(enFile, JSON.stringify({ welcome: "Welcome" }));

            await translateDirectory({
                baseDirectory: dir,
                engine: Engine.ChatGPT,
                inputLanguageCode: "en",
                model: "gpt-4o",
                outputLanguageCode: "fr",
                promptMode,
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

            await translateDirectory({
                baseDirectory: dir,
                engine: Engine.ChatGPT,
                inputLanguageCode: "en",
                model: "gpt-4o",
                outputLanguageCode: "fr",
                promptMode,
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

            await translateDirectory({
                baseDirectory: dir,
                engine: Engine.ChatGPT,
                inputLanguageCode: "en",
                model: "gpt-4o",
                outputLanguageCode: "fr",
                promptMode,
                rateLimitMs: 0,
            } as any);

            const frFile1 = path.join(dir, "fr", "app.json");
            const frFile2 = path.join(dir, "fr", "nested", "app.json");

            const frJSON1 = JSON.parse(fs.readFileSync(frFile1, "utf-8"));
            const frJSON2 = JSON.parse(fs.readFileSync(frFile2, "utf-8"));

            expect(frJSON1).toEqual({ welcome: fr("Welcome") });
            expect(frJSON2).toEqual({ greeting: fr("Hello") });
        });
    },
);

describe.each(Object.values(PromptMode))(
    "translateDirectoryDiff (promptMode=%s)",
    (promptMode) => {
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

            await translateDirectoryDiff({
                baseDirectory: dir,
                engine: Engine.ChatGPT,
                inputFolderNameAfter: "en_after",
                inputFolderNameBefore: "en_before",
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
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

            fs.writeFileSync(
                beforeFile,
                JSON.stringify({ welcome: "Welcome" }),
            );
            fs.writeFileSync(afterFile, JSON.stringify({ greeting: "Hello" }));
            fs.writeFileSync(
                afterNestedFile,
                JSON.stringify({ farewell: "Goodbye" }),
            );

            fs.writeFileSync(frFile, JSON.stringify({ welcome: "Bienvenue" }));

            await translateDirectoryDiff({
                baseDirectory: dir,
                engine: Engine.ChatGPT,
                inputFolderNameAfter: "en_after",
                inputFolderNameBefore: "en_before",
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
                rateLimitMs: 0,
                verbose: true,
            } as any);

            const updated = JSON.parse(fs.readFileSync(frFile, "utf-8"));
            const updatedNested = JSON.parse(
                fs.readFileSync(frNestedFile, "utf-8"),
            );

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

            await translateDirectoryDiff({
                baseDirectory: dir,
                engine: Engine.ChatGPT,
                inputFolderNameAfter: "en_after",
                inputFolderNameBefore: "en_before",
                inputLanguageCode: "en",
                model: "gpt-4o",
                promptMode,
                rateLimitMs: 0,
                verbose: true,
            } as any);

            const updatedFr = JSON.parse(fs.readFileSync(frFile, "utf-8"));
            const updatedEs = JSON.parse(fs.readFileSync(esFile, "utf-8"));

            expect(updatedFr).toEqual({ hello: fr("Hi") });
            expect(updatedEs).toEqual({ hello: es("Hi") });
        });
    },
);

describe("RateLimiter", () => {
    const mockedDelay = utils.delay as jest.MockedFunction<typeof utils.delay>;

    const delayBetweenCallsMs = 500;

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    it("returns immediately when no API call has been made", async () => {
        const rl = new RateLimiter(delayBetweenCallsMs, true);

        // Date.now() is irrelevant here, but stub anyway for determinism.
        jest.spyOn(Date, "now").mockReturnValue(1_000);

        await rl.wait();

        expect(mockedDelay).not.toHaveBeenCalled();
    });

    it("returns immediately when enough time has already passed since the last call", async () => {
        const now = 10_000;
        jest.spyOn(Date, "now").mockReturnValue(now);

        const rl = new RateLimiter(delayBetweenCallsMs, true);
        rl.lastAPICall = now - delayBetweenCallsMs - 50; // already past the window

        await rl.wait();

        expect(mockedDelay).not.toHaveBeenCalled();
    });

    it("waits the correct time when called too soon and verboseLogging = true", async () => {
        const now = 20_000;
        const timeRemaining = 125; // ms still to wait

        // Stub Date.now() for this test
        jest.spyOn(Date, "now").mockReturnValue(now);

        const rl = new RateLimiter(delayBetweenCallsMs, true);
        rl.lastAPICall = now - (delayBetweenCallsMs - timeRemaining);

        await rl.wait();

        expect(mockedDelay).toHaveBeenCalledTimes(1);
        expect(mockedDelay).toHaveBeenCalledWith(timeRemaining);
    });

    it("does not log when verboseLogging = false", async () => {
        const now = 30_000;
        const timeRemaining = 200;

        jest.spyOn(Date, "now").mockReturnValue(now);

        const rl = new RateLimiter(delayBetweenCallsMs, false);
        rl.lastAPICall = now - (delayBetweenCallsMs - timeRemaining);

        await rl.wait();

        expect(mockedDelay).toHaveBeenCalledWith(timeRemaining);
    });
});
