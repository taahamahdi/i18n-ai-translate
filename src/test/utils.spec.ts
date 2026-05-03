import {
    DIRECTORY_KEY_DELIMITER,
    getLanguageCodeFromFilename,
    getLanguageName,
    getTranslationDirectoryKey,
    resolveLanguageCode,
} from "../utils";

describe("getLanguageCodeFromFilename", () => {
    it("returns a plain ISO-639-1 code as-is", () => {
        expect(getLanguageCodeFromFilename("fr.json")).toBe("fr");
        expect(getLanguageCodeFromFilename("/a/b/de.json")).toBe("de");
    });

    it("accepts BCP-47 tags by falling back to the language subtag", () => {
        expect(getLanguageCodeFromFilename("es-ES.json")).toBe("es");
        expect(getLanguageCodeFromFilename("pt-BR.json")).toBe("pt");
        expect(getLanguageCodeFromFilename("zh-CN.json")).toBe("zh");
    });

    it("strips additional extensions", () => {
        expect(getLanguageCodeFromFilename("fr.locale.json")).toBe("fr");
    });

    it("returns the raw prefix if neither form is a valid ISO-639-1 code", () => {
        // Caller decides what to do with an unknown code.
        expect(getLanguageCodeFromFilename("klingon.json")).toBe("klingon");
    });
});

describe("getLanguageName", () => {
    it("expands common ISO-639-1 codes to English names", () => {
        expect(getLanguageName("en")).toBe("English");
        expect(getLanguageName("fr")).toBe("French");
        expect(getLanguageName("ja")).toBe("Japanese");
        expect(getLanguageName("zh")).toBe("Chinese");
    });

    it("returns the raw code when the lookup fails", () => {
        expect(getLanguageName("xx")).toBe("xx");
        expect(getLanguageName("klingon")).toBe("klingon");
    });
});

describe("resolveLanguageCode", () => {
    it("returns valid ISO-639-1 codes unchanged", () => {
        expect(resolveLanguageCode("en")).toBe("en");
        expect(resolveLanguageCode("fr")).toBe("fr");
    });

    it("resolves English names to their ISO code", () => {
        expect(resolveLanguageCode("English")).toBe("en");
        expect(resolveLanguageCode("French")).toBe("fr");
        expect(resolveLanguageCode("Japanese")).toBe("ja");
    });

    it("is case-insensitive and tolerates whitespace", () => {
        expect(resolveLanguageCode("ENGLISH")).toBe("en");
        expect(resolveLanguageCode("  english  ")).toBe("en");
        expect(resolveLanguageCode("EnGlIsH")).toBe("en");
    });

    it("returns the raw input when no match is found", () => {
        expect(resolveLanguageCode("Klingon")).toBe("Klingon");
        expect(resolveLanguageCode("xx")).toBe("xx");
    });
});

describe("getTranslationDirectoryKey", () => {
    it("survives Windows-style paths that contain a drive-letter colon", () => {
        // Before the delimiter fix this would have produced a compound
        // key with two colons and split() would have shredded the path.
        // Paths are normalised to forward slashes so the language-swap
        // replace works on both platforms.
        const key = getTranslationDirectoryKey(
            "C:\\repo\\i18n\\en\\app.json",
            "welcome",
            "en",
            "fr",
        );

        expect(key).toBe(
            `C:/repo/i18n/fr/app.json${DIRECTORY_KEY_DELIMITER}welcome`,
        );

        // Round-trip: the key part should come back out intact.
        const [pathPart, keyPart] = key.split(DIRECTORY_KEY_DELIMITER);
        expect(pathPart).toBe("C:/repo/i18n/fr/app.json");
        expect(keyPart).toBe("welcome");
    });

    it("swaps the input language segment for the output language", () => {
        const key = getTranslationDirectoryKey(
            "/base/en/app.json",
            "hello",
            "en",
            "fr",
        );

        expect(key.startsWith("/base/fr/app.json")).toBe(true);
    });

    it("swaps the language segment on Windows-style backslash paths", () => {
        // Before the normalisation fix the replace looked for '/en/'
        // against a path containing '\\en\\', found nothing, and
        // silently left the language segment unchanged.
        const key = getTranslationDirectoryKey(
            "C:\\repo\\i18n\\en\\app.json",
            "welcome",
            "en",
            "fr",
        );

        expect(key.startsWith("C:/repo/i18n/fr/app.json")).toBe(true);
        expect(key.includes("/en/")).toBe(false);
    });

    it("handles mixed separators on the same path", () => {
        // Happens when users join via path.posix on Windows or build
        // paths via concatenation rather than path.join.
        const key = getTranslationDirectoryKey(
            "C:\\repo/i18n/en\\app.json",
            "hello",
            "en",
            "fr",
        );

        expect(key.startsWith("C:/repo/i18n/fr/app.json")).toBe(true);
    });
});
