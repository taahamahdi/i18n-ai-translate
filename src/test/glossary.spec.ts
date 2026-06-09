import { buildGlossaryInstructions, loadGlossary } from "../glossary";
import fs from "fs";
import os from "os";
import path from "path";
import type Glossary from "../interfaces/glossary";

const writeGlossary = (content: string): string => {
    const file = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "i18n-glossary-")),
        "glossary.json",
    );

    fs.writeFileSync(file, content);
    return file;
};

describe("loadGlossary", () => {
    it("loads a valid glossary", () => {
        const file = writeGlossary(
            JSON.stringify({
                doNotTranslate: ["Acme"],
                terms: { fr: { Account: "Compte" } },
            }),
        );

        const glossary = loadGlossary(file);
        expect(glossary.doNotTranslate).toEqual(["Acme"]);
        expect(glossary.terms?.fr?.Account).toBe("Compte");
    });

    it("accepts an empty object", () => {
        expect(loadGlossary(writeGlossary("{}"))).toEqual({});
    });

    it("throws for a missing file", () => {
        expect(() => loadGlossary("/no/such/glossary.json")).toThrow(
            /Could not read glossary/,
        );
    });

    it("throws for invalid JSON", () => {
        expect(() => loadGlossary(writeGlossary("{ not json"))).toThrow(
            /not valid JSON/,
        );
    });

    it("throws when doNotTranslate is not a string array", () => {
        const file = writeGlossary(JSON.stringify({ doNotTranslate: [1, 2] }));
        expect(() => loadGlossary(file)).toThrow(/doNotTranslate/);
    });

    it("throws when terms is not a nested string map", () => {
        const file = writeGlossary(
            JSON.stringify({ terms: { fr: { Account: 5 } } }),
        );

        expect(() => loadGlossary(file)).toThrow(/terms\.fr/);
    });

    it("throws when the root is not an object", () => {
        expect(() => loadGlossary(writeGlossary("42"))).toThrow(
            /must be a JSON object/,
        );
    });

    it("throws when terms is not an object", () => {
        const file = writeGlossary(JSON.stringify({ terms: "nope" }));
        expect(() => loadGlossary(file)).toThrow(/keyed by language code/);
    });
});

describe("buildGlossaryInstructions", () => {
    const glossary: Glossary = {
        doNotTranslate: ["Acme", "ProductX"],
        terms: {
            es: { Account: "Cuenta" },
            fr: { Account: "Compte", Settings: "Paramètres" },
            pt: { Account: "Conta" },
        },
    };

    it("returns empty string when there is no glossary", () => {
        expect(buildGlossaryInstructions(undefined, "fr")).toBe("");
    });

    it("returns empty string when nothing applies to the language", () => {
        expect(buildGlossaryInstructions({ terms: { fr: {} } }, "de")).toBe("");
    });

    it("lists do-not-translate terms", () => {
        const out = buildGlossaryInstructions(
            { doNotTranslate: ["Acme"] },
            "fr",
        );

        expect(out).toContain("do not translate them");
        expect(out).toContain("\"Acme\"");
    });

    it("includes only the matching language's forced terms", () => {
        const out = buildGlossaryInstructions(glossary, "fr");
        expect(out).toContain("\"Account\" → \"Compte\"");
        expect(out).toContain("\"Settings\" → \"Paramètres\"");
        // The Spanish term must not leak into the French prompt.
        expect(out).not.toContain("Cuenta");
    });

    it("falls back to the base subtag for BCP-47 codes", () => {
        const out = buildGlossaryInstructions(glossary, "pt-BR");
        expect(out).toContain("\"Account\" → \"Conta\"");
    });

    it("ends in a blank line so it can be prepended to a prompt", () => {
        const out = buildGlossaryInstructions({ doNotTranslate: ["Acme"] }, "fr");
        expect(out.endsWith("\n\n")).toBe(true);
    });
});
