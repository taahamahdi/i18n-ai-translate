import {
    failedTranslationPrompt,
    generationPrompt as csvGenerationPrompt,
    translationVerificationPrompt as csvTranslationVerificationPrompt,
} from "../generate_csv/prompts";
import {
    translationPromptJSON,
    verificationPromptJSON,
} from "../generate_json/prompts";

describe("prompt builders", () => {
    describe("language-name expansion", () => {
        it("CSV generation expands en/fr to English/French", () => {
            const out = csvGenerationPrompt("en", "fr", '"hello"');
            expect(out).toContain("from English to French");
            expect(out).not.toContain("from en to fr");
        });

        it("JSON generation expands en/es to English/Spanish", () => {
            const out = translationPromptJSON("en", "es", []);
            expect(out).toContain("from English to Spanish");
            expect(out).not.toContain("from en to es");
        });

        it("falls back to the raw code for unknown language codes", () => {
            const out = translationPromptJSON("en", "xx", []);
            // "xx" isn't a real ISO code, so the fallback passes it through.
            expect(out).toContain("to xx");
        });
    });

    describe("context injection", () => {
        it("prepends a Product context line when context is provided", () => {
            const out = translationPromptJSON("en", "fr", [], {
                context: "a B2B invoicing SaaS",
            });

            expect(out).toMatch(/^Product context: a B2B invoicing SaaS\n\n/);
        });

        it("omits the context line when context is absent", () => {
            const out = translationPromptJSON("en", "fr", []);
            expect(out).not.toMatch(/^Product context:/);
        });

        it("trims whitespace around the context value", () => {
            const out = translationPromptJSON("en", "fr", [], {
                context: "   a music trivia game   ",
            });

            expect(out).toContain("Product context: a music trivia game\n");
        });
    });

    describe("plural-suffix hints", () => {
        it("fires when any key ends in a CLDR plural suffix", () => {
            const out = translationPromptJSON("en", "fr", [], {
                keys: ["notifications_one", "notifications_other"],
            });

            expect(out).toContain("CLDR plural suffixes");
        });

        it("does not fire for keys without plural suffixes", () => {
            const out = translationPromptJSON("en", "fr", [], {
                keys: ["welcome_message", "goodbye"],
            });

            expect(out).not.toContain("CLDR plural suffixes");
        });

        it("recognises _zero, _two, _few, _many alongside _one/_other", () => {
            for (const suffix of [
                "zero",
                "one",
                "two",
                "few",
                "many",
                "other",
            ]) {
                const out = translationPromptJSON("en", "fr", [], {
                    keys: [`item_${suffix}`],
                });

                expect(out).toContain("CLDR plural suffixes");
            }
        });
    });

    describe("placeholder delimiter customisation", () => {
        it("references the user's configured delimiter in the {{NEWLINE}} line", () => {
            const out = translationPromptJSON("en", "fr", [], {
                templatedStringPrefix: "${",
                templatedStringSuffix: "}",
            });

            expect(out).toContain("${NEWLINE}");
            expect(out).not.toContain("{{NEWLINE}}");
        });

        it("defaults to {{...}} when no delimiter is provided", () => {
            const out = translationPromptJSON("en", "fr", []);
            expect(out).toContain("{{NEWLINE}}");
        });
    });

    describe("failedTranslationPrompt", () => {
        it("includes both the source and the failed output", () => {
            const out = failedTranslationPrompt(
                "en",
                "fr",
                "welcomeMessage",
                "welcomeMessage",
            );

            // Source is distinguished from failed output by its heading.
            expect(out).toMatch(/Source \(English\):/);
            expect(out).toMatch(/Failed French output:/);
            expect(out).toContain("welcomeMessage");
        });

        it("expands the language codes to names", () => {
            const out = failedTranslationPrompt("en", "fr", "a", "b");
            expect(out).toContain("English");
            expect(out).toContain("French");
            expect(out).not.toContain("[en]");
            expect(out).not.toContain("[fr]");
        });
    });

    describe("verificationPromptJSON", () => {
        it("contains the 'do not revise correct translations' instruction", () => {
            const out = verificationPromptJSON("en", "fr", []);
            expect(out).toMatch(/Do not revise correct translations/);
        });
    });

    describe("CSV translationVerificationPrompt", () => {
        it("now checks both accuracy and styling in one pass", () => {
            const out = csvTranslationVerificationPrompt("en", "fr", "a", "b");
            expect(out).toMatch(/Inaccurate meaning/);
            expect(out).toMatch(/capitalization, punctuation, or whitespace/);
        });
    });
});
