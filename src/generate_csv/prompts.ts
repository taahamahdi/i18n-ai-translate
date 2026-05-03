import { getLanguageName } from "../utils";
import type OverridePrompt from "../interfaces/override_prompt";

function buildContextPreamble(context?: string): string {
    if (!context || context.trim() === "") return "";
    return `Product context: ${context.trim()}\n\n`;
}

/**
 * Prompt an AI to convert a given input from one language to another
 * @param inputLanguageCode - The ISO-639-1 code of the input
 * @param outputLanguageCode - The ISO-639-1 code of the output
 * @param input - The input to be translated
 * @param options - Optional override/context knobs
 * @returns A prompt for the AI to translate the input
 */
export function generationPrompt(
    inputLanguageCode: string,
    outputLanguageCode: string,
    input: string,
    options?: {
        overridePrompt?: OverridePrompt;
        context?: string;
    },
): string {
    const inputLanguage = getLanguageName(inputLanguageCode);
    const outputLanguage = getLanguageName(outputLanguageCode);
    const customPrompt = options?.overridePrompt?.generationPrompt;

    if (customPrompt) {
        const requiredArguments = ["inputLanguage", "outputLanguage", "input"];
        for (const arg of requiredArguments) {
            if (!customPrompt.includes(`\${${arg}}`)) {
                throw new Error(`Missing required argument: \${${arg}}`);
            }
        }

        const argumentToValue: { [key: string]: string } = {
            context: options?.context ?? "",
            input,
            inputLanguage,
            outputLanguage,
        };

        return customPrompt.replace(/\$\{([^}]+)\}/g, (match, key) =>
            key in argumentToValue ? argumentToValue[key] : match,
        );
    }

    const contextPreamble = buildContextPreamble(options?.context);

    return `${contextPreamble}You are a professional translator.

Translate each line from ${inputLanguage} to ${outputLanguage}.

Return translations in the same text formatting.

Maintain case sensitivity and whitespacing.

Output only the translations.

All lines should start and end with an ASCII quotation mark (").

\`\`\`
${input}
\`\`\`
`;
}

/**
 * Prompt an AI to correct a failed translation
 * @param inputLanguageCode - The ISO-639-1 code of the input
 * @param outputLanguageCode - The ISO-639-1 code of the output
 * @param source - The original source string that should have been translated
 * @param failedOutput - The previous failed attempt at translating it
 * @returns A prompt for the AI to retry the translation
 */
export function failedTranslationPrompt(
    inputLanguageCode: string,
    outputLanguageCode: string,
    source: string,
    failedOutput: string,
): string {
    const inputLanguage = getLanguageName(inputLanguageCode);
    const outputLanguage = getLanguageName(outputLanguageCode);

    return `You are a professional translator.

A previous attempt to translate the following ${inputLanguage} text into ${outputLanguage} failed.

Source (${inputLanguage}):
\`\`\`
${source}
\`\`\`

Failed ${outputLanguage} output:
\`\`\`
${failedOutput}
\`\`\`

Re-translate the source into ${outputLanguage}. If the source reads like a concatenation of ${inputLanguage} words (camelCase, snake_case, or compound), split it mentally before translating. Return only the translation, wrapped in ASCII quotation marks ("). Maintain case sensitivity and whitespacing.
`;
}

/**
 * Prompt an AI to ensure a translation is valid
 *
 * This is a single rubric that replaces the old separate accuracy and
 * styling ACK/NAK prompts. The response is still text: NAK if any
 * translation is incorrect on either accuracy or styling grounds,
 * ACK otherwise. Merging the two prompts halves the round-trip cost
 * and fixes the line-alignment fragility that showed up when one of
 * the two prompts disagreed on line counts.
 *
 * @param inputLanguageCode - The ISO-639-1 code of the input
 * @param outputLanguageCode - The ISO-639-1 code of the output
 * @param input - The original input, one item per line
 * @param output - The translated output, one item per line
 * @param options - Optional override/context knobs
 * @returns A prompt for the AI to verify the translation
 */
export function translationVerificationPrompt(
    inputLanguageCode: string,
    outputLanguageCode: string,
    input: string,
    output: string,
    options?: {
        overridePrompt?: OverridePrompt;
        context?: string;
    },
): string {
    const inputLanguage = getLanguageName(inputLanguageCode);
    const outputLanguage = getLanguageName(outputLanguageCode);
    const splitInput = input.split("\n");
    const splitOutput = output.split("\n");
    const mergedCSV = splitInput
        .map((x, i) => `${x},${splitOutput[i] ?? ""}`)
        .join("\n");

    const customPrompt = options?.overridePrompt?.translationVerificationPrompt;
    if (customPrompt) {
        const requiredArguments = [
            "inputLanguage",
            "outputLanguage",
            "mergedCSV",
        ];
        for (const arg of requiredArguments) {
            if (!customPrompt.includes(`\${${arg}}`)) {
                throw new Error(`Missing required argument: \${${arg}}`);
            }
        }

        const argumentToValue: { [key: string]: string } = {
            context: options?.context ?? "",
            inputLanguage,
            mergedCSV,
            outputLanguage,
        };

        return customPrompt.replace(/\$\{([^}]+)\}/g, (match, key) =>
            key in argumentToValue ? argumentToValue[key] : match,
        );
    }

    const contextPreamble = buildContextPreamble(options?.context);

    return `${contextPreamble}You are a translation reviewer checking a ${inputLanguage}-to-${outputLanguage} batch in CSV form.

Reply with NAK if ANY translation has a problem, including:
- Inaccurate meaning, wrong tone, or grammar errors
- Mismatched capitalization, punctuation, or whitespace vs. the original
- Missing or extra placeholders, or altered variable names

Otherwise, reply with ACK.

Reply with ACK or NAK only — no explanation.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCSV}
\`\`\`
`;
}

/**
 * Legacy standalone styling prompt.
 *
 * Kept for backwards compatibility with custom override-prompt files
 * that still reference `stylingVerificationPrompt`. New code should use
 * `translationVerificationPrompt` above, which checks both accuracy and
 * styling in a single pass. Calling this function without a matching
 * override returns an ACK (no-op) — the merged prompt above already
 * handles styling.
 * @param inputLanguageCode - The ISO-639-1 code of the input
 * @param outputLanguageCode - The ISO-639-1 code of the output
 * @param input - The original input
 * @param output - The translated output
 * @param options - Optional override/context knobs
 * @returns A prompt for the AI, or a sentinel indicating no standalone check
 */
export function stylingVerificationPrompt(
    inputLanguageCode: string,
    outputLanguageCode: string,
    input: string,
    output: string,
    options?: {
        overridePrompt?: OverridePrompt;
        context?: string;
    },
): string {
    const inputLanguage = getLanguageName(inputLanguageCode);
    const outputLanguage = getLanguageName(outputLanguageCode);
    const splitInput = input.split("\n");
    const splitOutput = output.split("\n");
    const mergedCSV = splitInput
        .map((x, i) => `${x},${splitOutput[i] ?? ""}`)
        .join("\n");

    const customPrompt = options?.overridePrompt?.stylingVerificationPrompt;
    if (customPrompt) {
        const requiredArguments = [
            "inputLanguage",
            "outputLanguage",
            "mergedCSV",
        ];
        for (const arg of requiredArguments) {
            if (!customPrompt.includes(`\${${arg}}`)) {
                throw new Error(`Missing required argument: \${${arg}}`);
            }
        }

        const argumentToValue: { [key: string]: string } = {
            context: options?.context ?? "",
            inputLanguage,
            mergedCSV,
            outputLanguage,
        };

        return customPrompt.replace(/\$\{([^}]+)\}/g, (match, key) =>
            key in argumentToValue ? argumentToValue[key] : match,
        );
    }

    // No standalone styling check by default; the accuracy prompt above
    // already folds in styling. Return a trivial ACK-producing prompt so
    // callers that still invoke this function get a no-op.
    return `Reply with ACK.`;
}
