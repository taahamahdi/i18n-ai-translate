import { getLanguageName } from "../utils";
import type { TranslateItemInput, VerifyItemInput } from "./types";
import type OverridePrompt from "../interfaces/override_prompt";

// CLDR plural suffixes used by i18next keys. When a key ends in one of
// these, the suffix carries semantic meaning and should be preserved.
const PLURAL_SUFFIX_PATTERN = /_(zero|one|two|few|many|other)$/;

function buildContextPreamble(context?: string): string {
    if (!context || context.trim() === "") return "";
    return `Product context: ${context.trim()}\n\n`;
}

function buildPlaceholderLine(
    templatedStringPrefix: string,
    templatedStringSuffix: string,
): string {
    const newlineRef = `${templatedStringPrefix}NEWLINE${templatedStringSuffix}`;
    const varRef = `${templatedStringPrefix}variableName${templatedStringSuffix}`;
    return `- Treat anything in the format ${varRef} as a placeholder. Never translate or modify its content. Do not convert ${newlineRef} to \\n.`;
}

function pluralHint(keys: string[] | undefined): string {
    if (!keys || keys.length === 0) return "";
    const hasPlural = keys.some((k) => PLURAL_SUFFIX_PATTERN.test(k));
    if (!hasPlural) return "";
    return `- Some keys end in CLDR plural suffixes (_zero, _one, _two, _few, _many, _other). These are i18next plural markers; apply the target language's correct plural form to the translated text but do not translate the suffix itself.\n`;
}

/**
 * Prompt an AI to convert a given input from one language to another
 * @param inputLanguageCode - The ISO-639-1 code of the input
 * @param outputLanguageCode - The ISO-639-1 code of the output
 * @param translateItems - The input to be translated
 * @param options - Optional prompt-shaping inputs: override, context, placeholder delimiters, key list for plural detection
 * @returns A prompt for the AI to translate the input
 */
export function translationPromptJSON(
    inputLanguageCode: string,
    outputLanguageCode: string,
    translateItems: TranslateItemInput[],
    options?: {
        overridePrompt?: OverridePrompt;
        context?: string;
        templatedStringPrefix?: string;
        templatedStringSuffix?: string;
        keys?: string[];
    },
): string {
    const inputLanguage = getLanguageName(inputLanguageCode);
    const outputLanguage = getLanguageName(outputLanguageCode);
    const input = JSON.stringify(translateItems);
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

    const prefix = options?.templatedStringPrefix ?? "{{";
    const suffix = options?.templatedStringSuffix ?? "}}";
    const contextPreamble = buildContextPreamble(options?.context);
    const plural = pluralHint(options?.keys);
    const placeholderLine = buildPlaceholderLine(prefix, suffix);

    return `${contextPreamble}You are a professional translator.

Translate from ${inputLanguage} to ${outputLanguage}.

- Translate each object in the array.
- 'original' is the text to be translated.
- 'translated' must not be empty.
- 'context' is additional info if needed.
- 'failure' explains why the previous translation failed; use it to avoid repeating the same mistake.
- Preserve text formatting, case sensitivity, and whitespace. UI strings should stay close to the source length where possible.

Special Instructions:
${placeholderLine}
- Do not add variables that are not in the original.
- The number of variables must be the same in the translated text.
${plural}
Return the translation as JSON.
\`\`\`json
${input}
\`\`\`
`;
}

/**
 * Prompt an AI to ensure a translation is valid
 * @param inputLanguageCode - The ISO-639-1 code of the input
 * @param outputLanguageCode - The ISO-639-1 code of the output
 * @param verificationInput - The input to be translated
 * @param options - Optional prompt-shaping inputs
 * @returns A prompt for the AI to verify the translation
 */
export function verificationPromptJSON(
    inputLanguageCode: string,
    outputLanguageCode: string,
    verificationInput: VerifyItemInput[],
    options?: {
        overridePrompt?: OverridePrompt;
        context?: string;
        templatedStringPrefix?: string;
        templatedStringSuffix?: string;
    },
): string {
    const inputLanguage = getLanguageName(inputLanguageCode);
    const outputLanguage = getLanguageName(outputLanguageCode);
    const input = JSON.stringify(verificationInput);
    const customPrompt = options?.overridePrompt?.translationVerificationPrompt;

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

    const prefix = options?.templatedStringPrefix ?? "{{";
    const suffix = options?.templatedStringSuffix ?? "}}";
    const contextPreamble = buildContextPreamble(options?.context);
    const placeholderLine = buildPlaceholderLine(prefix, suffix);

    return `${contextPreamble}You are a professional translator.

Check translations from ${inputLanguage} to ${outputLanguage}.

- Verify each object in the array.
- 'original' is the text to be translated.
- 'translated' is the translated text.
- 'context' is additional info if needed.
- 'failure' explains why a prior translation failed; only populated during re-verification.
- Check for accuracy (meaning, tone, grammar) and formatting (case, whitespace, punctuation).

Do not revise correct translations. Flag only issues that meaningfully affect accuracy or readability.
If the translation is correct, return 'valid' as 'true' and leave 'fixedTranslation' and 'issue' empty.
If the translation is incorrect, return 'valid' as 'false', put the corrected translation in 'fixedTranslation', and explain the problem in 'issue'.

Special Instructions:
${placeholderLine}
- Do not add variables that are not in the original.
- The number of variables must be the same in the translated text.

Return the verified output as JSON.
\`\`\`json
${input}
\`\`\`
`;
}
