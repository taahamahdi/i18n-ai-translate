import {
    CACHE_VERSION,
    cacheKey,
    createCache,
    getCachedTranslation,
    loadCache,
    saveCache,
    setCachedTranslation,
} from "../cache";
import fs from "fs";
import os from "os";
import path from "path";

const tmpFile = (): string =>
    path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "i18n-cache-")),
        "cache.json",
    );

describe("cacheKey", () => {
    it("is deterministic for identical inputs", () => {
        expect(cacheKey("en", "fr", "", "Hello")).toBe(
            cacheKey("en", "fr", "", "Hello"),
        );
    });

    it("differs by source text, languages, and context", () => {
        const base = cacheKey("en", "fr", "", "Hello");
        expect(cacheKey("en", "fr", "", "Goodbye")).not.toBe(base);
        expect(cacheKey("en", "es", "", "Hello")).not.toBe(base);
        expect(cacheKey("de", "fr", "", "Hello")).not.toBe(base);
        expect(cacheKey("en", "fr", "a SaaS app", "Hello")).not.toBe(base);
    });
});

describe("get/set cached translation", () => {
    it("round-trips a stored translation", () => {
        const cache = createCache();
        expect(
            getCachedTranslation(cache, "en", "fr", "", "Hello"),
        ).toBeUndefined();

        setCachedTranslation(cache, "en", "fr", "", "Hello", "Bonjour");
        expect(getCachedTranslation(cache, "en", "fr", "", "Hello")).toBe(
            "Bonjour",
        );
    });

    it("keeps entries for different languages and contexts separate", () => {
        const cache = createCache();
        setCachedTranslation(cache, "en", "fr", "", "Hello", "Bonjour");
        setCachedTranslation(cache, "en", "es", "", "Hello", "Hola");
        setCachedTranslation(cache, "en", "fr", "formal", "Hello", "Bonjour M.");

        expect(getCachedTranslation(cache, "en", "fr", "", "Hello")).toBe(
            "Bonjour",
        );

        expect(getCachedTranslation(cache, "en", "es", "", "Hello")).toBe(
            "Hola",
        );

        expect(getCachedTranslation(cache, "en", "fr", "formal", "Hello")).toBe(
            "Bonjour M.",
        );
    });
});

describe("loadCache / saveCache", () => {
    it("returns a fresh cache when the file is missing", () => {
        const cache = loadCache(tmpFile());
        expect(cache.version).toBe(CACHE_VERSION);
        expect(cache.entries).toEqual({});
    });

    it("round-trips a saved cache through disk", () => {
        const file = tmpFile();
        const cache = createCache();
        setCachedTranslation(cache, "en", "fr", "", "Hello", "Bonjour");
        saveCache(file, cache);

        const reloaded = loadCache(file);
        expect(getCachedTranslation(reloaded, "en", "fr", "", "Hello")).toBe(
            "Bonjour",
        );
    });

    it("ignores a cache written at an incompatible version", () => {
        const file = tmpFile();
        fs.writeFileSync(
            file,
            JSON.stringify({ entries: { abc: "x" }, version: 999 }),
        );

        const cache = loadCache(file);
        expect(cache.version).toBe(CACHE_VERSION);
        expect(cache.entries).toEqual({});
    });

    it("ignores a malformed cache file", () => {
        const file = tmpFile();
        fs.writeFileSync(file, "not json at all {");

        const cache = loadCache(file);
        expect(cache.entries).toEqual({});
    });
});
