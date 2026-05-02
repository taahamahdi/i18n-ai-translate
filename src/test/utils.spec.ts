import { getLanguageCodeFromFilename } from "../utils";

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
