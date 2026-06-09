import { splitTranslationLines } from "../generate_csv/generate";

describe("splitTranslationLines (Bug 6)", () => {
    it("returns each line for a clean response", () => {
        expect(splitTranslationLines('"a"\n"b"\n"c"')).toEqual([
            '"a"',
            '"b"',
            '"c"',
        ]);
    });

    it("drops a trailing newline the model often appends", () => {
        expect(splitTranslationLines('"a"\n"b"\n')).toEqual(['"a"', '"b"']);
    });

    it("drops blank separator and leading blank lines", () => {
        expect(splitTranslationLines('\n"a"\n\n"b"\n')).toEqual(['"a"', '"b"']);
    });

    it("treats whitespace-only lines as blank", () => {
        expect(splitTranslationLines('"a"\n   \n"b"')).toEqual(['"a"', '"b"']);
    });
});
