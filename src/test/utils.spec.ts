import path from "path";

import { getTranslationDirectoryKey, replaceLanguageInPath } from "../utils";

describe("getTranslationDirectoryKey", () => {
    it("swaps language segments for POSIX-style paths", () => {
        const source = "/project/en/nested/app.json";
        const key = "welcome";

        const result = getTranslationDirectoryKey(source, key, "en", "fr");

        expect(result).toEqual("/project/fr/nested/app.json:welcome");
    });

    it("swaps language segments for Windows-style paths", () => {
        const source = path.win32.join(
            "C:\\project",
            "en",
            "nested",
            "app.json",
        );
        const key = "greeting";

        const result = getTranslationDirectoryKey(source, key, "en", "fr");

        expect(result).toEqual(
            `${path.win32.join("C:\\project", "fr", "nested", "app.json")}:greeting`,
        );
    });

    it("leaves path unchanged when output language omitted", () => {
        const source = "/project/en/app.json";

        const result = getTranslationDirectoryKey(source, "bye", "en");

        expect(result).toEqual("/project/en/app.json:bye");
    });
});

describe("replaceLanguageInPath", () => {
    it("swaps language segment in POSIX path", () => {
        const source = "/workspace/en/app.json";

        const result = replaceLanguageInPath(source, "en", "fr");

        expect(result).toEqual("/workspace/fr/app.json");
    });

    it("swaps language segment in Windows path with drive letter", () => {
        const source = "C:/workspace/en/app.json";

        const result = replaceLanguageInPath(source, "en", "fr");

        expect(result).toEqual(
            path.win32.normalize("C:/workspace/fr/app.json"),
        );
    });

    it("swaps language segment in Windows path with backslashes", () => {
        const source = path.win32.join(
            "C:\\workspace",
            "en",
            "nested",
            "app.json",
        );

        const result = replaceLanguageInPath(source, "en", "fr");

        expect(result).toEqual(
            path.win32.join("C:\\workspace", "fr", "nested", "app.json"),
        );
    });

    it("returns normalized path when language segment missing", () => {
        const source = "/workspace/app.json";

        const result = replaceLanguageInPath(source, "en", "fr");

        expect(result).toEqual("/workspace/app.json");
    });
});

