import fs from "fs";
import type Glossary from "./interfaces/glossary";

/**
 * Load and validate a glossary JSON file. Unlike the cache, a malformed
 * glossary is a user configuration error, so this throws with a clear
 * message rather than silently ignoring it.
 * @param filePath - path to the glossary JSON file
 * @returns the parsed glossary
 */
export function loadGlossary(filePath: string): Glossary {
    let raw: string;
    try {
        raw = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
        throw new Error(`Could not read glossary file ${filePath}: ${e}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Glossary ${filePath} is not valid JSON: ${e}`);
    }

    if (typeof parsed !== "object" || parsed === null) {
        throw new Error(`Glossary ${filePath} must be a JSON object`);
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.doNotTranslate !== undefined) {
        if (
            !Array.isArray(obj.doNotTranslate) ||
            !obj.doNotTranslate.every((t) => typeof t === "string")
        ) {
            throw new Error(
                `Glossary ${filePath}: "doNotTranslate" must be an array of strings`,
            );
        }
    }

    if (obj.terms !== undefined) {
        if (typeof obj.terms !== "object" || obj.terms === null) {
            throw new Error(
                `Glossary ${filePath}: "terms" must be an object keyed by language code`,
            );
        }

        for (const [lang, mapping] of Object.entries(obj.terms)) {
            if (
                typeof mapping !== "object" ||
                mapping === null ||
                !Object.values(mapping).every((v) => typeof v === "string")
            ) {
                throw new Error(
                    `Glossary ${filePath}: "terms.${lang}" must map source strings to translated strings`,
                );
            }
        }
    }

    return obj as Glossary;
}

/**
 * Resolve the forced-term map for a target language, accepting an exact
 * match (e.g. `pt-BR`) or its base subtag (`pt`).
 * @param glossary - the glossary
 * @param outputLanguageCode - the run's target language code
 * @returns the term map for that language, or undefined
 */
function termsForLanguage(
    glossary: Glossary,
    outputLanguageCode: string,
): { [source: string]: string } | undefined {
    if (!glossary.terms) return undefined;
    if (glossary.terms[outputLanguageCode]) {
        return glossary.terms[outputLanguageCode];
    }

    const base = outputLanguageCode.split(/[-_]/)[0];
    return glossary.terms[base];
}

/**
 * Build the glossary instruction block injected into a prompt for one
 * target language. Returns an empty string when nothing applies, so
 * callers can prepend it unconditionally.
 * @param glossary - the glossary, or undefined
 * @param outputLanguageCode - the run's target language code
 * @returns the instruction block (ending in a blank line), or ""
 */
export function buildGlossaryInstructions(
    glossary: Glossary | undefined,
    outputLanguageCode: string,
): string {
    if (!glossary) return "";

    const lines: string[] = [];

    const dnt = (glossary.doNotTranslate ?? []).filter(
        (t) => t.trim() !== "",
    );
    if (dnt.length > 0) {
        const quoted = dnt.map((t) => `"${t}"`).join(", ");
        lines.push(
            `- Keep these terms exactly as written, do not translate them: ${quoted}.`,
        );
    }

    const terms = termsForLanguage(glossary, outputLanguageCode);
    if (terms) {
        const pairs = Object.entries(terms)
            .filter(([source]) => source.trim() !== "")
            .map(([source, target]) => `"${source}" → "${target}"`);

        if (pairs.length > 0) {
            lines.push(
                `- Use these exact translations for the following terms: ${pairs.join("; ")}.`,
            );
        }
    }

    if (lines.length === 0) return "";

    return `Glossary (follow strictly):\n${lines.join("\n")}\n\n`;
}
